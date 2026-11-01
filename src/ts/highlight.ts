import { Kind } from './types';

/** 赤ペンで印をつける箇所の種類 */
export type MarkType = 'privacy' | 'url' | 'date' | 'number' | 'assert' | 'vague' | 'name' | 'danger';

export const MARK_TYPES: { key: MarkType; label: string; desc: string }[] = [
  { key: 'privacy', label: '個人情報・機密', desc: 'メール・電話番号・キーなど' },
  { key: 'danger', label: '危ない処理', desc: '削除・強制実行・innerHTML など' },
  { key: 'url', label: 'URL', desc: '実在するか開いて確認' },
  { key: 'date', label: '日付', desc: '曜日・年もあわせて確認' },
  { key: 'number', label: '数字', desc: '元データ・計算と照合' },
  { key: 'name', label: '固有名詞', desc: '社名・人名・敬称' },
  { key: 'assert', label: '言い切り', desc: '必ず・絶対・100% など' },
  { key: 'vague', label: '根拠があいまい', desc: '一般的に・言われています など' },
];

interface Rule {
  type: MarkType;
  re: RegExp;
  /** 対象にしない種類 */
  skip?: Kind[];
  /** この種類だけ対象 */
  only?: Kind[];
}

// 配列の順が優先度（重なったときは先のルールが勝つ）
const RULES: Rule[] = [
  { type: 'privacy', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { type: 'privacy', re: /0\d{1,4}-\d{1,4}-\d{3,4}/g },
  { type: 'privacy', re: /(?:パスワード|password|passwd|api[_-]?key|secret|token|アクセスキー|秘密鍵)/gi },
  { type: 'privacy', re: /(?:sk|pk|ghp|AKIA)[-_A-Za-z0-9]{12,}/g },
  { type: 'url', re: /https?:\/\/[^\s<>"'（）「」、。]+/g },
  { type: 'danger', re: /(?:rm\s+-rf|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE|--force|\bforce\s*:\s*true|\beval\s*\(|innerHTML|dangerouslySetInnerHTML|TODO|FIXME)/gi, only: ['code'] },
  { type: 'date', re: /(?:令和|平成|昭和)?\d{1,4}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?(?:\s*[（(][日月火水木金土][)）])?/g, skip: ['code'] },
  { type: 'date', re: /\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, skip: ['code'] },
  { type: 'date', re: /\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*[（(][日月火水木金土][)）])?/g, skip: ['code'] },
  { type: 'number', re: /[-+]?[\d０-９][\d０-９,，.．]*\s*(?:%|％|パーセント|円|万円|億円|万|億|兆|千|人|名|件|個|社|年|か月|ヶ月|カ月|週間|日間|時間|分|秒|倍|位|歳|割|km|kg|m|g|GB|MB|TB)?/g, skip: ['code'] },
  { type: 'name', re: /(?:株式会社|有限会社|合同会社|[（(]株[)）])\s*[^\s、。,.「」（）()]{1,16}|[^\s、。,.「」（）()]{1,16}(?:株式会社|有限会社|大学|銀行|省|庁|協会)/g, skip: ['code'] },
  { type: 'name', re: /[一-龯ァ-ヶー]{1,8}(?:様|さん|氏|先生|部長|課長|社長|会長)/g, skip: ['code'] },
  { type: 'assert', re: /(?:必ず|絶対(?:に)?|100\s*[%％]|間違いなく|確実(?:に)?|常に|すべての|全ての|唯一|最も|最高|最安|最大級|No\.?\s?1|ナンバーワン|保証(?:します)?|誰でも|一切|完全に)/gi, skip: ['code'] },
  { type: 'vague', re: /(?:一般的に|一般的には|と言われて(?:います|いる)|とされて(?:います|いる)|と考えられて(?:います|いる)|諸説|多くの専門家|専門家によると|研究によると|調査によると|データによると|某)/g, skip: ['code'] },
];

export interface Segment {
  text: string;
  /** 印をつける箇所なら種類と開始位置 */
  type?: MarkType;
  start: number;
}

interface Hit {
  type: MarkType;
  start: number;
  end: number;
  priority: number;
}

/** 本文を「ふつうの文字」と「赤ペンで印をつける箇所」に分ける */
export function segment(body: string, kind: Kind): Segment[] {
  const hits: Hit[] = [];
  RULES.forEach((rule, priority) => {
    if (rule.skip?.includes(kind)) return;
    if (rule.only && !rule.only.includes(kind)) return;
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(body)) !== null) {
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      const text = m[0].replace(/\s+$/, '');
      // 1桁だけの数字（箇条書きの番号など）は対象外
      if (rule.type === 'number' && /^[-+]?[\d０-９]$/.test(text)) continue;
      hits.push({ type: rule.type, start: m.index, end: m.index + text.length, priority });
    }
  });

  hits.sort((a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end);
  const picked: Hit[] = [];
  hits.forEach((h) => {
    const overlap = picked.findIndex((p) => h.start < p.end && p.start < h.end);
    if (overlap === -1) {
      picked.push(h);
      return;
    }
    // 重なったら優先度の高いほうを残す
    if (h.priority < picked[overlap].priority) picked[overlap] = h;
  });
  picked.sort((a, b) => a.start - b.start);

  const segs: Segment[] = [];
  let pos = 0;
  picked.forEach((h) => {
    if (h.start < pos) return;
    if (h.start > pos) segs.push({ text: body.slice(pos, h.start), start: pos });
    segs.push({ text: body.slice(h.start, h.end), type: h.type, start: h.start });
    pos = h.end;
  });
  if (pos < body.length) segs.push({ text: body.slice(pos), start: pos });
  return segs;
}

/** 印の数（種類ごと） */
export function countMarks(segs: Segment[]): Map<MarkType, number> {
  const map = new Map<MarkType, number>();
  segs.forEach((s) => {
    if (s.type) map.set(s.type, (map.get(s.type) ?? 0) + 1);
  });
  return map;
}
