/** 成果物の種類 */
export type Kind = 'text' | 'mail' | 'doc' | 'code' | 'data';

/** 重要度。1=個人用 / 2=社内 / 3=社外公開 */
export type Level = 1 | 2 | 3;

/** チェック項目の結果。ng=問題あり / fixed=問題あり→直した / na=該当なし */
export type CheckResult = 'ok' | 'ng' | 'fixed' | 'na';

/** 判定。pending=検品中 / ok=OK / fix=要修正 / reject=差し戻し */
export type Verdict = 'pending' | 'ok' | 'fix' | 'reject';

/** 責任サイン */
export interface Signature {
  /** 確認した人 */
  name: string;
  /** サインした日時（ミリ秒） */
  at: number;
}

/** users/{uid}/inspections/{id} */
export interface Inspection {
  id: string;
  title: string;
  kind: Kind;
  level: Level;
  /** 作ったAI（ChatGPT など） */
  aiTool: string;
  /** AIの出力本文 */
  body: string;
  /** チェック項目ID → 結果 */
  checks: Record<string, CheckResult>;
  /** 赤ペンで「確認した」印をつけた箇所（本文の開始位置） */
  marks: number[];
  verdict: Verdict;
  /** 修正メモ・判断の理由 */
  memo: string;
  signature: Signature | null;
  createdAt: number;
}

/** マイチェック項目（users/{uid}/meta/checklist の items） */
export interface CustomItem {
  id: string;
  text: string;
  category: string;
}
