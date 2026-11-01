import { Inspection, CustomItem } from './types';
import { CHECK_ITEMS, CATEGORIES, AI_TOOLS, KINDS } from './options';

/** チェック項目ID → 分類（消したマイチェック項目は「その他」扱い） */
function categoryMap(custom: CustomItem[]): Map<string, string> {
  const map = new Map<string, string>();
  CHECK_ITEMS.forEach((c) => map.set(c.id, c.category));
  custom.forEach((c) => map.set(c.id, c.category));
  return map;
}

/** 見つけたミスの数（「問題あり」と「直した」） */
export function findingCount(i: Inspection): number {
  return Object.values(i.checks).filter((r) => r === 'ng' || r === 'fixed').length;
}

export function signed(list: Inspection[]): Inspection[] {
  return list.filter((i) => i.verdict !== 'pending');
}

export interface Summary {
  total: number;
  signedCount: number;
  findings: number;
  /** ミスが見つかった検品の割合（%） */
  catchRate: number | null;
}

export function summary(list: Inspection[]): Summary {
  const s = signed(list);
  const findings = list.reduce((sum, i) => sum + findingCount(i), 0);
  const withFinding = s.filter((i) => findingCount(i) > 0).length;
  return {
    total: list.length,
    signedCount: s.length,
    findings,
    catchRate: s.length ? Math.round((withFinding / s.length) * 100) : null,
  };
}

export interface Bar {
  label: string;
  count: number;
}

/** 分類ごとのミスの数（多い順） */
export function byCategory(list: Inspection[], custom: CustomItem[]): Bar[] {
  const map = categoryMap(custom);
  const counts = new Map<string, number>();
  list.forEach((i) => Object.entries(i.checks).forEach(([id, r]) => {
    if (r !== 'ng' && r !== 'fixed') return;
    const cat = map.get(id) ?? 'その他';
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }));
  return [...CATEGORIES, 'その他']
    .map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface ToolRow {
  label: string;
  count: number;
  findings: number;
  /** 1件あたりのミス */
  perItem: number;
}

/** 作ったAIごとの、1件あたりのミスの数 */
export function byTool(list: Inspection[]): ToolRow[] {
  return AI_TOOLS.map((label) => {
    const items = list.filter((i) => i.aiTool === label && Object.keys(i.checks).length > 0);
    const findings = items.reduce((sum, i) => sum + findingCount(i), 0);
    return { label, count: items.length, findings, perItem: items.length ? findings / items.length : 0 };
  }).filter((r) => r.count > 0);
}

export function byKind(list: Inspection[]): ToolRow[] {
  return KINDS.map(({ key, label }) => {
    const items = list.filter((i) => i.kind === key && Object.keys(i.checks).length > 0);
    const findings = items.reduce((sum, i) => sum + findingCount(i), 0);
    return { label, count: items.length, findings, perItem: items.length ? findings / items.length : 0 };
  }).filter((r) => r.count > 0);
}

/** いちばん多いミスの分類から、次に気をつけることをひとこと */
export function adviceFor(bars: Bar[]): string {
  if (!bars.length) return 'まだミスは記録されていません。チェックで「問題あり」を付けると、AIのクセがここに見えてきます。';
  const top = bars[0].label;
  const tips: Record<string, string> = {
    '事実・正確さ': 'もっともらしい誤りが多めです。事実は一次情報で確かめるクセを。',
    '数字・計算': '数字のまちがいが多めです。数字は必ず元データか電卓で検算を。',
    '出典・根拠': '根拠の弱い言い切りが多めです。出典を開いて該当箇所まで確認を。',
    '固有名詞': '名前・宛先のまちがいが多めです。公式表記や元のやりとりと照合を。',
    '個人情報・機密': '機密の混入が多めです。AIに渡す前と出す前の2回チェックを。',
    '権利・ルール': '表現ルールの違反が多めです。誇大表現・引用のしかたを重点的に。',
    '表現・トーン': '言い過ぎ・温度感のズレが多めです。受け取る側になって読み直しを。',
    '抜け漏れ・前提': '前提の取り違えが多めです。依頼のときに条件を先に伝えると減らせます。',
    '動作・安全性': '動作・安全面の問題が多めです。必ず動かしてから使いましょう。',
  };
  return `いちばん多いのは「${top}」。${tips[top] ?? 'この分類を重点的にチェックしましょう。'}`;
}
