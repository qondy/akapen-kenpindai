import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf } from './dates';
import {
  KINDS, KIND_LABEL, LEVELS, LEVEL_LABEL, AI_TOOLS, VERDICTS, VERDICT_LABEL, RESULT_LABEL, CATEGORIES,
  AI_LINKS, CROSS_PROMPTS, CheckItem, checklistFor,
} from './options';
import { segment, countMarks, MARK_TYPES, MarkType, Segment } from './highlight';
import {
  subscribeInspections, createInspection, updateInspection, saveChecks, saveMarks, signInspection,
  reopenInspection, deleteInspection, subscribeChecklist, saveChecklist, InspectionInput,
} from './store';
import { summary, byCategory, byTool, byKind, adviceFor, findingCount, signed, Bar, ToolRow } from './stats';
import { Inspection, Kind, Level, CheckResult, Verdict, CustomItem } from './types';
import { initClickTracking } from './analytics';

initClickTracking();

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabsBar = $('tabs-bar');
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const countQueue = $('count-queue');
const countLog = $('count-log');

const todayDateEl = $('today-date');
const flowPending = $('flow-pending');
const flowFindings = $('flow-findings');
const flowSigned = $('flow-signed');
const queueList = $('queue-list');

const inputSearch = $<HTMLInputElement>('input-search');
const logChips = $('log-chips');
const logList = $('log-list');

const statSigned = $('stat-signed');
const statFindings = $('stat-findings');
const statCatch = $('stat-catch');
const habitAdvice = $('habit-advice');
const categoryBars = $('category-bars');
const toolRows = $('tool-rows');
const kindRows = $('kind-rows');
const customForm = $<HTMLFormElement>('custom-form');
const inputCustom = $<HTMLInputElement>('input-custom');
const selectCustomCategory = $<HTMLSelectElement>('select-custom-category');
const btnCustomAdd = $<HTMLButtonElement>('btn-custom-add');
const customList = $('custom-list');

const deskBadges = $('desk-badges');
const deskTitle = $('desk-title');
const progressChecks = $('progress-checks');
const progressChecksFill = $('progress-checks-fill');
const progressMarks = $('progress-marks');
const progressMarksFill = $('progress-marks-fill');
const markLegend = $('mark-legend');
const deskBody = $('desk-body');
const checklistDesc = $('checklist-desc');
const checklistEl = $('checklist');
const crossList = $('cross-list');
const crossAiLinks = $('cross-ai-links');
const signFormWrap = $('sign-form-wrap');
const inputMemo = $<HTMLTextAreaElement>('input-memo');
const verdictOptions = $('verdict-options');
const inputSigner = $<HTMLInputElement>('input-signer');
const signWarning = $('sign-warning');
const btnSign = $<HTMLButtonElement>('btn-sign');
const certificate = $('certificate');

const btnFab = $<HTMLButtonElement>('btn-fab');
const btnAddInline = $<HTMLButtonElement>('btn-add-inline');

const itemOverlay = $('item-modal-overlay');
const itemForm = $<HTMLFormElement>('item-form');
const itemModalTitle = $('item-modal-title');
const inputTitle = $<HTMLInputElement>('input-title');
const kindChips = $('kind-chips');
const levelOptions = $('level-options');
const toolChips = $('tool-chips');
const inputBody = $<HTMLTextAreaElement>('input-body');
const btnItemSubmit = $<HTMLButtonElement>('btn-item-submit');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'queue' | 'log' | 'habit';
type LogFilter = 'all' | Exclude<Verdict, 'pending'>;

interface State {
  uid: string | null;
  displayName: string;
  unsubscribers: (() => void)[];
  items: Inspection[];
  custom: CustomItem[];
  loaded: boolean;
  tab: Tab;
  /** 開いている検品台（null なら一覧） */
  deskId: string | null;
  logFilter: LogFilter;
  search: string;
  /** 赤ペンで表示しない印の種類 */
  hiddenMarks: Set<MarkType>;
  editingId: string | null;
  formKind: Kind;
  formLevel: Level;
  formTool: string;
  verdict: Exclude<Verdict, 'pending'>;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const state: State = {
  uid: null,
  displayName: '',
  unsubscribers: [],
  items: [],
  custom: [],
  loaded: false,
  tab: 'queue',
  deskId: null,
  logFilter: 'all',
  search: '',
  hiddenMarks: new Set(),
  editingId: null,
  formKind: 'text',
  formLevel: 2,
  formTool: AI_TOOLS[0],
  verdict: 'ok',
  pending: new Set(),
  confirmAction: null,
};

const SIGNER_KEY = 'akapen-kenpindai:signer';

function loadSigner(): string {
  try {
    return localStorage.getItem(SIGNER_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeSigner(name: string): void {
  try {
    localStorage.setItem(SIGNER_KEY, name);
  } catch {
    // 保存できない環境では毎回入力してもらう
  }
}

// ============================================================
// Helpers
// ============================================================
const findItem = (id: string | null): Inspection | undefined =>
  (id ? state.items.find((i) => i.id === id) : undefined);

const pendingItems = (): Inspection[] => state.items.filter((i) => i.verdict === 'pending');

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function emptyState(text: string): HTMLElement {
  return textEl('p', 'empty-state', text);
}

function pill(text: string, className: string): HTMLElement {
  return textEl('span', className, text);
}

async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch {
    // クリップボードAPIが使えない環境向けのフォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    showToast(ok ? done : 'コピーできませんでした');
  }
}

function aiLinks(container: HTMLElement): void {
  container.replaceChildren();
  AI_LINKS.forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'ai-link';
    a.textContent = l.label;
    container.appendChild(a);
  });
}

function dateTimeLabel(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function itemChecklist(i: Inspection): CheckItem[] {
  return checklistFor(i.kind, i.level, state.custom);
}

interface Progress {
  answered: number;
  total: number;
  ng: number;
  marksDone: number;
  marksTotal: number;
}

function progressOf(i: Inspection, segs?: Segment[]): Progress {
  const list = itemChecklist(i);
  const answered = list.filter((c) => i.checks[c.id]).length;
  const ng = list.filter((c) => i.checks[c.id] === 'ng').length;
  const marks = (segs ?? segment(i.body, i.kind)).filter((s) => s.type);
  const done = new Set(i.marks);
  return {
    answered,
    total: list.length,
    ng,
    marksDone: marks.filter((m) => done.has(m.start)).length,
    marksTotal: marks.length,
  };
}

function badges(i: Inspection, withVerdict: boolean): HTMLElement[] {
  const list = [
    pill(KIND_LABEL[i.kind], 'item-card__badge'),
    pill(LEVEL_LABEL[i.level], `level-pill level-pill--${i.level}`),
    pill(i.aiTool, 'source-pill'),
  ];
  if (withVerdict) list.push(pill(VERDICT_LABEL[i.verdict], `verdict-pill verdict-pill--${i.verdict}`));
  return list;
}

function confirmDelete(i: Inspection): void {
  askConfirm('削除しますか？', `「${i.title}」を削除します。チェックの結果とサインの記録も消え、元に戻せません。`, '削除する', async () => {
    const uid = state.uid;
    if (!uid) return;
    const ok = await withLock(`delete:${i.id}`, () => deleteInspection(uid, i.id), '削除に失敗しました');
    if (ok) {
      if (state.deskId === i.id) closeDesk();
      showToast('削除しました');
    }
  });
}

// ============================================================
// Render: 検品中
// ============================================================
function queueCard(i: Inspection): HTMLElement {
  const card = document.createElement('article');
  const p = progressOf(i);
  card.className = 'item-card item-card--idea item-card--link';
  const head = document.createElement('div');
  head.className = 'item-card__head';
  head.append(...badges(i, false));
  card.appendChild(head);
  card.appendChild(textEl('h4', 'item-card__title', i.title));
  card.appendChild(textEl('p', 'item-card__memo item-card__memo--clamp', i.body));
  const meta = [`チェック ${p.answered}/${p.total}`, `赤ペン ${p.marksDone}/${p.marksTotal}`];
  if (p.ng) meta.push(`問題あり ${p.ng}`);
  card.appendChild(textEl('p', `item-card__meta${p.ng ? ' is-alert' : ''}`, meta.join('・')));
  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  actions.append(
    button('検品する', 'btn btn--primary btn--sm', () => openDesk(i.id)),
    button('編集', 'text-btn', () => openItemModal(i.id)),
    button('削除', 'text-btn', () => confirmDelete(i)),
  );
  card.appendChild(actions);
  return card;
}

function renderQueue(): void {
  todayDateEl.textContent = labelOf(todayKey());
  const pend = pendingItems();
  flowPending.textContent = String(pend.length);
  flowFindings.textContent = String(state.items.reduce((s, i) => s + findingCount(i), 0));
  flowSigned.textContent = String(signed(state.items).length);
  if (!state.loaded) {
    queueList.replaceChildren(emptyState('読み込み中…'));
    return;
  }
  queueList.replaceChildren(...(pend.length
    ? pend.map(queueCard)
    : [emptyState(state.items.length
      ? '検品中のものはありません。AIに作ってもらったものがあれば、使う前に検品台へ。'
      : 'AIが作った文章・メール・資料・コードを貼り付けて、使う前に検品しましょう。右下の「＋」からも載せられます。')]));
}

// ============================================================
// Render: 確認ログ
// ============================================================
function logCard(i: Inspection): HTMLElement {
  const card = document.createElement('article');
  card.className = `item-card item-card--idea item-card--log item-card--${i.verdict}`;
  const head = document.createElement('div');
  head.className = 'item-card__head';
  head.append(...badges(i, true));
  const f = findingCount(i);
  if (f) head.appendChild(pill(`ミス ${f}`, 'finding-pill'));
  card.appendChild(head);
  card.appendChild(textEl('h4', 'item-card__title', i.title));
  if (i.signature) {
    card.appendChild(textEl('p', 'item-card__meta', `${dateTimeLabel(i.signature.at)}　確認者：${i.signature.name}`));
  }
  if (i.memo.trim()) card.appendChild(textEl('p', 'log-memo', i.memo));
  const actions = document.createElement('div');
  actions.className = 'item-card__actions';
  actions.append(
    button('検品台を開く', 'btn btn--ghost btn--sm', () => openDesk(i.id)),
    button('削除', 'text-btn', () => confirmDelete(i)),
  );
  card.appendChild(actions);
  return card;
}

function renderLog(): void {
  const s = signed(state.items);
  const filters: { key: LogFilter; label: string }[] = [
    { key: 'all', label: `すべて ${s.length}` },
    ...VERDICTS.map((v) => ({ key: v.key as LogFilter, label: `${v.label} ${s.filter((i) => i.verdict === v.key).length}` })),
  ];
  logChips.replaceChildren(...filters.map(({ key, label }) => {
    const b = button(label, `chip${state.logFilter === key ? ' is-active' : ''}`, () => {
      state.logFilter = key;
      renderLog();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.logFilter === key));
    return b;
  }));
  logChips.classList.toggle('hidden', s.length === 0);

  if (!state.loaded) {
    logList.replaceChildren(emptyState('読み込み中…'));
    return;
  }
  const q = state.search.trim().toLowerCase();
  const list = s
    .filter((i) => state.logFilter === 'all' || i.verdict === state.logFilter)
    .filter((i) => !q || [i.title, i.body, i.memo, i.signature?.name].some((t) => (t ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (b.signature?.at ?? 0) - (a.signature?.at ?? 0));
  logList.replaceChildren(...(list.length
    ? list.map(logCard)
    : [emptyState(s.length ? '条件に合う記録はありません。' : 'まだサインした記録はありません。検品が終わったら判定してサインすると、ここに残ります。')]));
}

// ============================================================
// Render: AIのクセ帳
// ============================================================
function barList(container: HTMLElement, bars: Bar[], empty: string): void {
  const max = Math.max(1, ...bars.map((b) => b.count));
  container.replaceChildren(...(bars.length ? bars.map((b) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const head = document.createElement('div');
    head.className = 'bar__head';
    head.append(textEl('span', 'bar__label', b.label), textEl('span', 'bar__value', `${b.count}件`));
    const track = document.createElement('div');
    track.className = 'bar__track';
    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    fill.style.width = `${Math.round((b.count / max) * 100)}%`;
    track.appendChild(fill);
    row.append(head, track);
    return row;
  }) : [emptyState(empty)]));
}

function rowList(container: HTMLElement, rows: ToolRow[], empty: string): void {
  container.replaceChildren(...(rows.length ? rows.map((r) => {
    const row = document.createElement('div');
    row.className = 'rows__item';
    row.append(
      textEl('span', 'rows__label', r.label),
      textEl('span', 'rows__meta', `${r.count}件中 ${r.findings}件`),
      textEl('strong', 'rows__value', r.perItem.toFixed(1)),
    );
    return row;
  }) : [emptyState(empty)]));
}

function renderCustomList(): void {
  customList.replaceChildren(...(state.custom.length ? state.custom.map((c) => {
    const row = document.createElement('div');
    row.className = 'custom-list__item';
    row.append(
      textEl('span', 'custom-list__text', c.text),
      pill(c.category, 'source-pill'),
      button('削除', 'text-btn', () => askConfirm('マイチェック項目を削除しますか？', `「${c.text}」をチェックリストから外します。これまでの検品の結果は残ります。`, '削除する', async () => {
        const uid = state.uid;
        if (!uid) return;
        const ok = await withLock('custom', () => saveChecklist(uid, state.custom.filter((x) => x.id !== c.id)));
        if (ok) showToast('削除しました');
      })),
    );
    return row;
  }) : [emptyState('まだありません。')]));
}

function renderHabit(): void {
  const s = summary(state.items);
  statSigned.textContent = String(s.signedCount);
  statFindings.textContent = String(s.findings);
  statCatch.textContent = s.catchRate === null ? '-' : `${s.catchRate}%`;
  const cats = byCategory(state.items, state.custom);
  habitAdvice.textContent = adviceFor(cats);
  barList(categoryBars, cats, 'まだミスの記録はありません。');
  rowList(toolRows, byTool(state.items), 'チェックを始めると、AIごとの傾向が見えてきます。');
  rowList(kindRows, byKind(state.items), 'チェックを始めると、種類ごとの傾向が見えてきます。');
  renderCustomList();
  btnCustomAdd.disabled = state.pending.has('custom');
}

// ============================================================
// Render: 検品台
// ============================================================
function renderDeskBody(i: Inspection, segs: Segment[]): void {
  const counts = countMarks(segs);
  markLegend.replaceChildren(...MARK_TYPES.filter((m) => counts.has(m.key)).map((m) => {
    const off = state.hiddenMarks.has(m.key);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `legend__item legend__item--${m.key}${off ? ' is-off' : ''}`;
    b.title = m.desc;
    b.setAttribute('aria-pressed', String(!off));
    b.append(textEl('span', 'legend__swatch', ''), textEl('span', '', `${m.label} ${counts.get(m.key)}`));
    b.addEventListener('click', () => {
      if (state.hiddenMarks.has(m.key)) state.hiddenMarks.delete(m.key);
      else state.hiddenMarks.add(m.key);
      renderDesk();
    });
    return b;
  }));
  if (!counts.size) markLegend.replaceChildren(textEl('p', 'legend__none', '自動で印を付ける箇所は見つかりませんでした。全文を自分の目で確認しましょう。'));

  const done = new Set(i.marks);
  const locked = i.verdict !== 'pending';
  deskBody.replaceChildren(...segs.map((s) => {
    if (!s.type || state.hiddenMarks.has(s.type)) return document.createTextNode(s.text);
    const type = s.type;
    const checked = done.has(s.start);
    const m = document.createElement('button');
    m.type = 'button';
    m.className = `mark mark--${type}${checked ? ' is-checked' : ''}`;
    m.textContent = s.text;
    m.disabled = locked;
    m.title = `${MARK_TYPES.find((t) => t.key === type)?.desc ?? ''}${checked ? '（確認済み）' : ''}`;
    m.setAttribute('aria-pressed', String(checked));
    m.addEventListener('click', () => toggleMark(i.id, s.start));
    return m;
  }));
}

function renderChecklist(i: Inspection): void {
  const list = itemChecklist(i);
  checklistDesc.textContent = `「${KIND_LABEL[i.kind]}」「${LEVEL_LABEL[i.level]}」向けの${list.length}項目です。問題があっても直したら「直した」に。見つけたミスはAIのクセ帳に記録されます。`;
  const locked = i.verdict !== 'pending';
  const groups = [...CATEGORIES, 'その他'].map((cat) => ({ cat, items: list.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length);
  checklistEl.replaceChildren(...groups.map((g) => {
    const group = document.createElement('div');
    group.className = 'checklist__group';
    group.appendChild(textEl('h4', 'checklist__cat', g.cat));
    g.items.forEach((c) => {
      const cur = i.checks[c.id];
      const row = document.createElement('div');
      row.className = `check${cur ? ` check--${cur}` : ''}`;
      const text = document.createElement('div');
      text.className = 'check__text';
      text.append(textEl('p', 'check__title', c.text), textEl('p', 'check__how', c.how));
      const opts = document.createElement('div');
      opts.className = 'check__opts';
      opts.setAttribute('role', 'radiogroup');
      opts.setAttribute('aria-label', c.text);
      (['ok', 'ng', 'fixed', 'na'] as CheckResult[]).forEach((r) => {
        const b = button(RESULT_LABEL[r], `check__opt check__opt--${r}${cur === r ? ' is-active' : ''}`, () => setCheck(i.id, c.id, r));
        b.disabled = locked;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(cur === r));
        opts.appendChild(b);
      });
      row.append(text, opts);
      group.appendChild(row);
    });
    return group;
  }));
}

function renderCross(i: Inspection): void {
  crossList.replaceChildren(...CROSS_PROMPTS.map((p) => {
    const card = document.createElement('div');
    card.className = 'cross';
    const text = document.createElement('div');
    text.className = 'cross__text';
    text.append(textEl('p', 'cross__title', p.label), textEl('p', 'cross__desc', p.desc));
    card.append(text, button('依頼文をコピー', 'btn btn--ghost btn--sm', () => void copyText(p.build(i), 'AIへの依頼文をコピーしました。別のAIに貼り付けてください')));
    return card;
  }));
}

function renderVerdictOptions(): void {
  verdictOptions.replaceChildren(...VERDICTS.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `segmented__btn segmented__btn--${v.key}${state.verdict === v.key ? ' is-active' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.verdict === v.key));
    b.append(textEl('span', 'segmented__label', v.label), textEl('span', 'segmented__desc', v.desc));
    b.addEventListener('click', () => {
      state.verdict = v.key;
      renderVerdictOptions();
      renderSignWarning();
    });
    return b;
  }));
}

/** OK でサインするには、全項目に答えて「問題あり」が残っていないこと */
function signBlocker(i: Inspection): string {
  const p = progressOf(i);
  if (state.verdict !== 'ok') return '';
  if (p.ng) return `「問題あり」が${p.ng}件残っています。直したら「直した」にするか、判定を「要修正」「差し戻し」にしてください。`;
  if (p.answered < p.total) return `チェックリストが${p.total - p.answered}項目残っています。すべて確認してからOKにしましょう。`;
  return '';
}

function renderSignWarning(): void {
  const i = findItem(state.deskId);
  if (!i) return;
  const block = signBlocker(i);
  const p = progressOf(i);
  let note = block;
  if (!note && p.marksDone < p.marksTotal) note = `赤ペンの印が${p.marksTotal - p.marksDone}箇所、未確認です（サインはできます）。`;
  signWarning.textContent = note;
  signWarning.classList.toggle('hidden', !note);
  signWarning.classList.toggle('is-block', !!block);
  btnSign.disabled = !!block || state.pending.has(`sign:${i.id}`);
}

function renderCertificate(i: Inspection): void {
  const sig = i.signature;
  if (!sig) {
    certificate.replaceChildren();
    return;
  }
  const stamp = textEl('div', `certificate__stamp certificate__stamp--${i.verdict}`, VERDICT_LABEL[i.verdict]);
  const body = document.createElement('div');
  body.className = 'certificate__body';
  body.append(
    textEl('p', 'certificate__label', '検品済み'),
    textEl('p', 'certificate__line', `確認者：${sig.name}`),
    textEl('p', 'certificate__line', `日時：${dateTimeLabel(sig.at)}`),
  );
  const f = findingCount(i);
  body.appendChild(textEl('p', 'certificate__line', `見つけたミス：${f}件`));
  if (i.memo.trim()) body.appendChild(textEl('p', 'certificate__memo', i.memo));
  const actions = document.createElement('div');
  actions.className = 'certificate__actions';
  actions.append(
    button('検品結果をコピー', 'btn btn--ghost btn--sm', () => void copyText(reportText(i), '検品結果をコピーしました')),
    button('サインを取り消して検品し直す', 'text-btn', () => askConfirm('サインを取り消しますか？', '判定とサインを取り消して「検品中」に戻します。チェックの結果とメモは残ります。', '取り消す', async () => {
      const uid = state.uid;
      if (!uid) return;
      const ok = await withLock(`sign:${i.id}`, () => reopenInspection(uid, i.id));
      if (ok) showToast('検品中に戻しました');
    })),
  );
  certificate.replaceChildren(stamp, body, actions);
}

/** 共有・報告用の検品結果テキスト */
function reportText(i: Inspection): string {
  const list = itemChecklist(i);
  const lines = [
    `【検品結果】${i.title}`,
    `判定：${VERDICT_LABEL[i.verdict]}`,
    `種類：${KIND_LABEL[i.kind]}／使い道：${LEVEL_LABEL[i.level]}／作ったAI：${i.aiTool}`,
  ];
  if (i.signature) lines.push(`確認者：${i.signature.name}（${dateTimeLabel(i.signature.at)}）`);
  const found = list.filter((c) => i.checks[c.id] === 'ng' || i.checks[c.id] === 'fixed');
  if (found.length) {
    lines.push('', '見つけたミス：');
    found.forEach((c) => lines.push(`・${c.text}（${RESULT_LABEL[i.checks[c.id]]}）`));
  }
  if (i.memo.trim()) lines.push('', `メモ：${i.memo.trim()}`);
  return lines.join('\n');
}

function renderDesk(): void {
  const i = findItem(state.deskId);
  if (!i) return;
  const segs = segment(i.body, i.kind);
  deskBadges.replaceChildren(...badges(i, true));
  deskTitle.textContent = i.title;
  const p = progressOf(i, segs);
  progressChecks.textContent = `${p.answered}/${p.total}${p.ng ? `（問題あり ${p.ng}）` : ''}`;
  progressChecksFill.style.width = `${p.total ? Math.round((p.answered / p.total) * 100) : 100}%`;
  progressChecksFill.classList.toggle('is-alert', p.ng > 0);
  progressMarks.textContent = `${p.marksDone}/${p.marksTotal}`;
  progressMarksFill.style.width = `${p.marksTotal ? Math.round((p.marksDone / p.marksTotal) * 100) : 100}%`;
  renderDeskBody(i, segs);
  renderChecklist(i);
  renderCross(i);
  const isSigned = i.verdict !== 'pending';
  signFormWrap.classList.toggle('hidden', isSigned);
  certificate.classList.toggle('hidden', !isSigned);
  if (isSigned) renderCertificate(i);
  else renderSignWarning();
}

function renderTabs(): void {
  const onDesk = !!state.deskId;
  tabsBar.classList.toggle('hidden', onDesk);
  btnFab.classList.toggle('hidden', onDesk);
  tabButtons.forEach((b) => {
    const on = b.dataset.tab === state.tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  panels.forEach((p) => p.classList.toggle('hidden', onDesk ? p.dataset.panel !== 'desk' : p.dataset.panel !== state.tab));
}

function renderAll(): void {
  const pend = pendingItems().length;
  countQueue.textContent = pend ? String(pend) : '';
  const s = signed(state.items).length;
  countLog.textContent = s ? String(s) : '';
  if (state.deskId && state.loaded && !findItem(state.deskId)) state.deskId = null;
  renderTabs();
  renderQueue();
  renderLog();
  renderHabit();
  renderDesk();
  btnItemSubmit.disabled = state.pending.has('item');
}

// ============================================================
// 検品台の操作
// ============================================================
function openDesk(id: string): void {
  const i = findItem(id);
  if (!i) return;
  state.deskId = id;
  state.hiddenMarks.clear();
  state.verdict = 'ok';
  inputMemo.value = i.memo;
  inputSigner.value = loadSigner() || state.displayName;
  renderVerdictOptions();
  renderAll();
  window.scrollTo({ top: 0 });
}

function closeDesk(): void {
  state.deskId = null;
  renderAll();
  window.scrollTo({ top: 0 });
}

function setCheck(id: string, checkId: string, r: CheckResult): void {
  const uid = state.uid;
  const i = findItem(id);
  if (!uid || !i || i.verdict !== 'pending') return;
  const next = { ...i.checks };
  // 同じボタンをもう一度押したら未回答に戻す
  if (next[checkId] === r) delete next[checkId];
  else next[checkId] = r;
  const prev = i.checks;
  i.checks = next;
  renderAll();
  void saveChecks(uid, id, next).catch((err) => {
    console.error(err);
    i.checks = prev;
    renderAll();
    showToast('保存に失敗しました。通信環境を確認してください');
  });
}

function toggleMark(id: string, start: number): void {
  const uid = state.uid;
  const i = findItem(id);
  if (!uid || !i || i.verdict !== 'pending') return;
  const prev = i.marks;
  const next = prev.includes(start) ? prev.filter((n) => n !== start) : [...prev, start];
  i.marks = next;
  renderAll();
  void saveMarks(uid, id, next).catch((err) => {
    console.error(err);
    i.marks = prev;
    renderAll();
    showToast('保存に失敗しました。通信環境を確認してください');
  });
}

btnSign.addEventListener('click', () => {
  const uid = state.uid;
  const i = findItem(state.deskId);
  if (!uid || !i) return;
  if (signBlocker(i)) {
    renderSignWarning();
    return;
  }
  const name = inputSigner.value.trim();
  if (!name) {
    showToast('確認した人の名前を入力してください');
    inputSigner.focus();
    return;
  }
  const verdict = state.verdict;
  const memo = inputMemo.value.trim();
  storeSigner(name);
  void withLock(`sign:${i.id}`, async () => {
    await signInspection(uid, i.id, verdict, memo, { name, at: Date.now() });
    showToast(verdict === 'ok' ? 'サインしました。おつかれさまでした！' : `「${VERDICT_LABEL[verdict]}」でサインしました`);
  });
});

$('btn-desk-back').addEventListener('click', closeDesk);
$('btn-desk-edit').addEventListener('click', () => {
  if (state.deskId) openItemModal(state.deskId);
});
$('btn-desk-delete').addEventListener('click', () => {
  const i = findItem(state.deskId);
  if (i) confirmDelete(i);
});

// ============================================================
// 検品台に載せる・編集
// ============================================================
function renderChoiceChips(container: HTMLElement, values: { key: string; label: string }[], current: string, onPick: (v: string) => void): void {
  container.replaceChildren(...values.map((v) => {
    const b = button(v.label, `chip${v.key === current ? ' is-active' : ''}`, () => onPick(v.key));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v.key === current));
    return b;
  }));
}

function renderItemFormChoices(): void {
  renderChoiceChips(kindChips, KINDS, state.formKind, (v) => { state.formKind = v as Kind; renderItemFormChoices(); });
  renderChoiceChips(toolChips, AI_TOOLS.map((t) => ({ key: t, label: t })), state.formTool, (v) => { state.formTool = v; renderItemFormChoices(); });
  levelOptions.replaceChildren(...LEVELS.map((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `segmented__btn${state.formLevel === l.key ? ' is-active' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.formLevel === l.key));
    b.append(textEl('span', 'segmented__label', l.label), textEl('span', 'segmented__desc', l.desc));
    b.addEventListener('click', () => {
      state.formLevel = l.key;
      renderItemFormChoices();
    });
    return b;
  }));
}

function openItemModal(id: string | null): void {
  const i = findItem(id);
  state.editingId = i ? i.id : null;
  itemModalTitle.textContent = i ? '検品台の内容を編集' : '検品台に載せる';
  btnItemSubmit.textContent = i ? '保存する' : '検品台に載せる';
  inputTitle.value = i?.title ?? '';
  inputBody.value = i?.body ?? '';
  state.formKind = i?.kind ?? 'text';
  state.formLevel = i?.level ?? 2;
  state.formTool = i?.aiTool ?? AI_TOOLS[0];
  renderItemFormChoices();
  openOverlay(itemOverlay);
  window.setTimeout(() => inputTitle.focus(), 50);
}

const closeItemModal = (): void => {
  closeOverlay(itemOverlay);
  state.editingId = null;
};

itemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const title = inputTitle.value.trim();
  const body = inputBody.value.replace(/\s+$/, '');
  if (!title) {
    showToast('タイトルを入力してください');
    return;
  }
  if (!body.trim()) {
    showToast('AIの出力を貼り付けてください');
    inputBody.focus();
    return;
  }
  const input: InspectionInput = { title, kind: state.formKind, level: state.formLevel, aiTool: state.formTool, body };
  const editing = findItem(state.editingId);
  void withLock('item', async () => {
    if (editing) {
      await updateInspection(uid, editing.id, input, editing.body !== body);
      closeItemModal();
      showToast(editing.body !== body ? '保存しました。本文が変わったので赤ペンの確認はやり直しです' : '保存しました');
    } else {
      const id = await createInspection(uid, input);
      closeItemModal();
      showToast('検品台に載せました。赤ペンで読んでいきましょう');
      // スナップショットの反映を待ってから開く
      const tryOpen = (n: number): void => {
        if (findItem(id)) openDesk(id);
        else if (n > 0) window.setTimeout(() => tryOpen(n - 1), 100);
      };
      tryOpen(20);
    }
  });
});

$('btn-item-close').addEventListener('click', closeItemModal);
$('btn-item-cancel').addEventListener('click', closeItemModal);

// ============================================================
// マイチェック項目
// ============================================================
selectCustomCategory.replaceChildren(...CATEGORIES.map((c) => {
  const o = document.createElement('option');
  o.value = c;
  o.textContent = c;
  return o;
}));

customForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const text = inputCustom.value.trim();
  if (!text) {
    showToast('チェック項目を入力してください');
    return;
  }
  if (state.custom.length >= 30) {
    showToast('マイチェック項目は30件までです');
    return;
  }
  const item: CustomItem = { id: `my-${Date.now().toString(36)}`, text, category: selectCustomCategory.value };
  void withLock('custom', async () => {
    await saveChecklist(uid, [...state.custom, item]);
    inputCustom.value = '';
    showToast('マイチェック項目を追加しました');
  });
});

// ============================================================
// 確認ダイアログ
// ============================================================
btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

// ============================================================
// フィードバック
// ============================================================
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// オーバーレイの背景クリックで閉じる（確認ダイアログは誤操作防止のため除外）
[itemOverlay, feedbackOverlay].forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    if (overlay === itemOverlay) closeItemModal();
    else closeOverlay(overlay);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeItemModal();
  closeOverlay(feedbackOverlay);
  closeOverlay(confirmOverlay);
  state.confirmAction = null;
});

// ============================================================
// Tabs / buttons
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => {
  state.tab = (b.dataset.tab as Tab) || 'queue';
  renderTabs();
  window.scrollTo({ top: 0 });
}));

btnFab.addEventListener('click', () => openItemModal(null));
btnAddInline.addEventListener('click', () => openItemModal(null));

inputSearch.addEventListener('input', () => {
  state.search = inputSearch.value;
  renderLog();
});

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    state.uid = null;
    state.items = [];
    state.custom = [];
    state.loaded = false;
    state.deskId = null;
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    return;
  }
  state.uid = user.uid;
  state.displayName = user.displayName ?? '';
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  renderAll();

  const onError = (err: Error): void => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  };
  state.unsubscribers.push(subscribeInspections(user.uid, (items) => {
    state.items = items;
    state.loaded = true;
    renderAll();
  }, onError));
  state.unsubscribers.push(subscribeChecklist(user.uid, (items) => {
    state.custom = items;
    renderAll();
  }, onError));
});

aiLinks(crossAiLinks);
