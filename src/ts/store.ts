import {
  collection, doc, onSnapshot, setDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Inspection, Kind, Level, CheckResult, Verdict, Signature, CustomItem } from './types';
import { AI_TOOLS, CATEGORIES } from './options';

const KIND_KEYS: Kind[] = ['text', 'mail', 'doc', 'code', 'data'];
const RESULTS: CheckResult[] = ['ok', 'ng', 'fixed', 'na'];
const VERDICT_KEYS: Verdict[] = ['pending', 'ok', 'fix', 'reject'];

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());

const inspectionsCol = (uid: string) => collection(db, 'users', uid, 'inspections');
const inspectionDoc = (uid: string, id: string) => doc(db, 'users', uid, 'inspections', id);
const checklistDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'checklist');

function parseChecks(v: unknown): Record<string, CheckResult> {
  const out: Record<string, CheckResult> = {};
  if (!v || typeof v !== 'object') return out;
  Object.entries(v as Record<string, unknown>).forEach(([k, r]) => {
    if (RESULTS.includes(r as CheckResult)) out[k] = r as CheckResult;
  });
  return out;
}

function parseSignature(v: unknown): Signature | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (typeof s.at !== 'number') return null;
  return { name: str(s.name), at: s.at };
}

export function subscribeInspections(
  uid: string,
  onData: (items: Inspection[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(inspectionsCol(uid), (snap) => {
    const list: Inspection[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.title !== 'string') return;
      const level = [1, 2, 3].includes(data.level) ? data.level as Level : 1;
      let verdict: Verdict = VERDICT_KEYS.includes(data.verdict) ? data.verdict : 'pending';
      const signature = parseSignature(data.signature);
      if (verdict !== 'pending' && !signature) verdict = 'pending';
      list.push({
        id: d.id,
        title: data.title,
        kind: KIND_KEYS.includes(data.kind) ? data.kind : 'text',
        level,
        aiTool: AI_TOOLS.includes(data.aiTool) ? data.aiTool : 'その他',
        body: str(data.body),
        checks: parseChecks(data.checks),
        marks: Array.isArray(data.marks) ? data.marks.filter((n: unknown) => typeof n === 'number') : [],
        verdict,
        memo: str(data.memo),
        signature: verdict === 'pending' ? null : signature,
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export interface InspectionInput {
  title: string;
  kind: Kind;
  level: Level;
  aiTool: string;
  body: string;
}

export async function createInspection(uid: string, input: InspectionInput): Promise<string> {
  const ref = await addDoc(inspectionsCol(uid), {
    ...input,
    checks: {},
    marks: [],
    verdict: 'pending',
    memo: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** 本文を変えた場合は赤ペンの印の位置がずれるのでリセットする */
export function updateInspection(uid: string, id: string, input: InspectionInput, bodyChanged: boolean): Promise<void> {
  const data: Record<string, unknown> = { ...input, updatedAt: serverTimestamp() };
  if (bodyChanged) data.marks = [];
  return setDoc(inspectionDoc(uid, id), data, { merge: true });
}

export function saveChecks(uid: string, id: string, checks: Record<string, CheckResult>): Promise<void> {
  // merge だと消した項目が残るため、checks はまるごと置き換える
  return setDoc(inspectionDoc(uid, id), { checks, updatedAt: serverTimestamp() }, { mergeFields: ['checks', 'updatedAt'] });
}

export function saveMarks(uid: string, id: string, marks: number[]): Promise<void> {
  return setDoc(inspectionDoc(uid, id), { marks, updatedAt: serverTimestamp() }, { merge: true });
}

export function saveMemo(uid: string, id: string, memo: string): Promise<void> {
  return setDoc(inspectionDoc(uid, id), { memo, updatedAt: serverTimestamp() }, { merge: true });
}

export function signInspection(uid: string, id: string, verdict: Exclude<Verdict, 'pending'>, memo: string, signature: Signature): Promise<void> {
  return setDoc(inspectionDoc(uid, id), {
    verdict, memo, signature, updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** サインを取り消して検品中に戻す */
export function reopenInspection(uid: string, id: string): Promise<void> {
  return setDoc(inspectionDoc(uid, id), {
    verdict: 'pending', signature: null, updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function deleteInspection(uid: string, id: string): Promise<void> {
  return deleteDoc(inspectionDoc(uid, id));
}

// ============================================================
// マイチェック項目
// ============================================================
export function subscribeChecklist(
  uid: string,
  onData: (items: CustomItem[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(checklistDoc(uid), (snap) => {
    const raw = snap.exists() ? snap.data().items : [];
    const items: CustomItem[] = Array.isArray(raw)
      ? raw.filter((c) => c && typeof c.id === 'string' && typeof c.text === 'string')
        .map((c) => ({ id: c.id, text: c.text, category: CATEGORIES.includes(c.category) ? c.category : CATEGORIES[0] }))
      : [];
    onData(items);
  }, onError);
}

export function saveChecklist(uid: string, items: CustomItem[]): Promise<void> {
  return setDoc(checklistDoc(uid), { items, updatedAt: serverTimestamp() });
}
