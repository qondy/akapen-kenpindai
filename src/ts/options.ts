import { Kind, Level, Verdict, CheckResult, Inspection, CustomItem } from './types';

export const KINDS: { key: Kind; label: string }[] = [
  { key: 'text', label: '文章' },
  { key: 'mail', label: 'メール・返信' },
  { key: 'doc', label: '資料・企画書' },
  { key: 'code', label: 'コード' },
  { key: 'data', label: '数値・分析' },
];

export const KIND_LABEL: Record<Kind, string> = {
  text: '文章', mail: 'メール', doc: '資料', code: 'コード', data: '数値・分析',
};

export const LEVELS: { key: Level; label: string; desc: string }[] = [
  { key: 1, label: '個人用', desc: '自分だけで使う' },
  { key: 2, label: '社内', desc: '同僚・家族に渡す' },
  { key: 3, label: '社外公開', desc: 'お客様・世の中へ' },
];

export const LEVEL_LABEL: Record<Level, string> = { 1: '個人用', 2: '社内', 3: '社外公開' };

export const AI_TOOLS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'その他'];

export const VERDICTS: { key: Exclude<Verdict, 'pending'>; label: string; desc: string }[] = [
  { key: 'ok', label: 'OK', desc: 'このまま使える' },
  { key: 'fix', label: '要修正', desc: '直してから使う' },
  { key: 'reject', label: '差し戻し', desc: '使わない・作り直し' },
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  pending: '検品中', ok: 'OK', fix: '要修正', reject: '差し戻し',
};

export const RESULT_LABEL: Record<CheckResult, string> = {
  ok: 'OK', ng: '問題あり', fixed: '直した', na: '該当なし',
};

/** ミスの分類（AIのクセ帳の集計単位） */
export const CATEGORIES = [
  '事実・正確さ',
  '数字・計算',
  '出典・根拠',
  '固有名詞',
  '個人情報・機密',
  '権利・ルール',
  '表現・トーン',
  '抜け漏れ・前提',
  '動作・安全性',
];

export interface CheckItem {
  id: string;
  text: string;
  /** 確認のしかた（ヒント） */
  how: string;
  category: string;
  /** 対象の種類（省略時はすべて） */
  kinds?: Kind[];
  /** この重要度以上で出す */
  minLevel: Level;
}

export const CHECK_ITEMS: CheckItem[] = [
  // 事実・正確さ
  { id: 'fact', text: '事実として書かれていることは正しいか', how: '一次情報（公式サイト・原典）で1つずつ確かめる', category: '事実・正確さ', minLevel: 1 },
  { id: 'latest', text: '情報が古くなっていないか（制度・価格・仕様など）', how: '日付のある公式情報と見比べる', category: '事実・正確さ', minLevel: 2 },
  { id: 'nonexist', text: 'もっともらしいけれど存在しないもの（機能・本・判例・URL）がないか', how: 'リンクや名前を実際に検索して開く', category: '事実・正確さ', minLevel: 1 },
  // 数字・計算
  { id: 'numbers', text: '数字・日付・金額は合っているか', how: '元データや電卓で計算し直す', category: '数字・計算', kinds: ['text', 'mail', 'doc', 'data'], minLevel: 1 },
  { id: 'units', text: '単位・桁・期間（税込/税抜、月/年など）の取り違えがないか', how: '単位をそろえて読み直す', category: '数字・計算', kinds: ['doc', 'data'], minLevel: 1 },
  { id: 'aggregate', text: '集計・比較の方法は妥当か（母数・期間・平均の取り方）', how: '同じ集計を自分で1回やってみる', category: '数字・計算', kinds: ['data'], minLevel: 1 },
  // 出典・根拠
  { id: 'source', text: '根拠・出典が示されているか、本当にそう書いてあるか', how: '出典を開いて該当箇所を探す', category: '出典・根拠', kinds: ['text', 'doc', 'data'], minLevel: 2 },
  { id: 'claim', text: '「一般的に」「言われています」など根拠のない言い切りがないか', how: '根拠が言えない文は弱めるか削る', category: '出典・根拠', minLevel: 2 },
  // 固有名詞
  { id: 'names', text: '人名・社名・商品名・敬称が正しいか', how: '名刺・公式表記・過去のやりとりと照合する', category: '固有名詞', kinds: ['text', 'mail', 'doc'], minLevel: 1 },
  { id: 'recipient', text: '宛先・相手・日程が取り違えていないか', how: '元のメールやカレンダーと照合する', category: '固有名詞', kinds: ['mail'], minLevel: 1 },
  // 個人情報・機密
  { id: 'privacy', text: '個人情報・社外秘が含まれていないか', how: '名前・連絡先・顧客情報・未公開情報を探す', category: '個人情報・機密', minLevel: 2 },
  { id: 'secret', text: 'パスワード・APIキー・社内URLが含まれていないか', how: 'キー・トークン・内部ドメインを検索する', category: '個人情報・機密', kinds: ['code', 'doc'], minLevel: 1 },
  // 権利・ルール
  { id: 'copyright', text: '他者の文章・画像・コードをそのまま使っていないか', how: '特徴的な一文を検索してみる', category: '権利・ルール', kinds: ['text', 'doc', 'code'], minLevel: 3 },
  { id: 'rules', text: '法律・業界ルール・社内規程に反していないか（誇大表現・景表法など）', how: '「最安」「No.1」「必ず」などの表現を見直す', category: '権利・ルール', minLevel: 3 },
  { id: 'license', text: '使っているライブラリのライセンス・利用条件は問題ないか', how: 'パッケージのライセンスを確認する', category: '権利・ルール', kinds: ['code'], minLevel: 2 },
  // 表現・トーン
  { id: 'overstate', text: '言い過ぎ・断定し過ぎていないか', how: '「必ず」「絶対」「100%」を確認する', category: '表現・トーン', kinds: ['text', 'mail', 'doc'], minLevel: 1 },
  { id: 'tone', text: '相手や場にふさわしい言葉づかい・温度感か', how: '受け取る側になって声に出して読む', category: '表現・トーン', kinds: ['text', 'mail', 'doc'], minLevel: 2 },
  { id: 'misread', text: '読み手が誤解しそうな書き方がないか', how: '前提を知らない人の目線で読み直す', category: '表現・トーン', kinds: ['text', 'mail', 'doc', 'data'], minLevel: 2 },
  { id: 'myvoice', text: '自分（自社）の言葉として出して違和感がないか', how: 'AIっぽい定型句・不自然な言い回しを直す', category: '表現・トーン', kinds: ['text', 'mail', 'doc'], minLevel: 3 },
  // 抜け漏れ・前提
  { id: 'purpose', text: '依頼した目的・質問にちゃんと答えているか', how: '最初の依頼文と見比べる', category: '抜け漏れ・前提', minLevel: 1 },
  { id: 'premise', text: '前提条件（自分の状況・制約）を取り違えていないか', how: 'AIに伝え忘れた条件がないか思い出す', category: '抜け漏れ・前提', minLevel: 1 },
  { id: 'missing', text: '大事な観点・例外・リスクが抜けていないか', how: '反対の立場で「足りないもの」を考える', category: '抜け漏れ・前提', kinds: ['text', 'doc', 'data'], minLevel: 2 },
  // 動作・安全性
  { id: 'run', text: '実際に動かして、期待どおりに動いたか', how: 'ローカルで実行・テストする', category: '動作・安全性', kinds: ['code'], minLevel: 1 },
  { id: 'edge', text: 'エラー・空データ・境界値でも壊れないか', how: '空・0・大量・不正な入力で試す', category: '動作・安全性', kinds: ['code'], minLevel: 2 },
  { id: 'security', text: 'セキュリティの穴（XSS・権限・入力チェック）がないか', how: 'ユーザー入力の通り道をたどる', category: '動作・安全性', kinds: ['code'], minLevel: 2 },
  { id: 'destructive', text: '削除・上書き・送信など取り消せない処理が含まれていないか', how: '実行前に対象と影響範囲を確かめる', category: '動作・安全性', kinds: ['code'], minLevel: 1 },
  // 最後の確認
  { id: 'responsible', text: 'この内容を自分の名前で出して、説明・責任を持てるか', how: '「なぜこう書いたか」を自分の言葉で言えるか確かめる', category: '抜け漏れ・前提', minLevel: 1 },
];

/** 種類と重要度に合わせたチェックリスト（マイチェック項目は最後に足す） */
export function checklistFor(kind: Kind, level: Level, custom: CustomItem[]): CheckItem[] {
  const base = CHECK_ITEMS.filter((c) => c.minLevel <= level && (!c.kinds || c.kinds.includes(kind)));
  const mine: CheckItem[] = custom.map((c) => ({
    id: c.id, text: c.text, how: 'マイチェック項目', category: c.category, minLevel: 1,
  }));
  return [...base, ...mine];
}

export const AI_LINKS: { label: string; url: string }[] = [
  { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  { label: 'Claude', url: 'https://claude.ai/new' },
  { label: 'Gemini', url: 'https://gemini.google.com/app' },
];

/** 依頼文に入れる本文は長すぎると貼り付けにくいので上限を設ける */
const PROMPT_BODY_MAX = 8000;

function bodyBlock(i: Inspection): string {
  const body = i.body.length > PROMPT_BODY_MAX ? `${i.body.slice(0, PROMPT_BODY_MAX)}\n（以下省略）` : i.body;
  return `---ここから---\n${body}\n---ここまで---`;
}

function context(i: Inspection): string {
  return `種類：${KIND_LABEL[i.kind]}／使い道：${LEVEL_LABEL[i.level]}`;
}

export const CROSS_PROMPTS: { key: string; label: string; desc: string; build: (i: Inspection) => string }[] = [
  {
    key: 'fact',
    label: 'ファクトチェック',
    desc: '事実・数字・固有名詞を1つずつ洗い出してもらう',
    build: (i) => [
      'あなたは慎重なファクトチェッカーです。次の文章（別のAIが作成）に含まれる「事実の主張・数字・日付・固有名詞・引用」をすべて抜き出し、1つずつ表にしてください。',
      '表の列：主張／正しさの見込み（高・中・低・判断不可）／確認すべき一次情報（公式サイト名など）／理由',
      '自信がないものは推測で埋めず「判断不可」としてください。最後に、人間が必ず自分で確認すべき上位3件を挙げてください。',
      context(i),
      bodyBlock(i),
    ].join('\n\n'),
  },
  {
    key: 'devil',
    label: '反対の立場から指摘',
    desc: 'あえて批判的に、弱点・抜け漏れを探してもらう',
    build: (i) => [
      'あなたは厳しいレビュアーです。次の成果物（別のAIが作成）に対して、あえて反対の立場から問題点を指摘してください。',
      '観点：論理の飛躍／抜けている観点・例外・リスク／言い過ぎ・断定し過ぎ／前提の取り違え／実行したときに起きそうなトラブル',
      '指摘は重要な順に最大10件、それぞれ「どこが」「なぜ問題か」「どう直すか」を短く書いてください。',
      context(i),
      bodyBlock(i),
    ].join('\n\n'),
  },
  {
    key: 'reader',
    label: '読み手目線で誤解チェック',
    desc: '受け取る人がどう読むか・誤解しそうな所を挙げてもらう',
    build: (i) => [
      '次の成果物を、前提知識のない読み手（受け取る相手）になったつもりで読んでください。',
      '1. 誤解されそうな表現・あいまいな表現',
      '2. 失礼・強すぎる・冷たく感じる言い回し',
      '3. 読み手が「で、どうすればいいの？」と迷う箇所',
      'をそれぞれ該当箇所を引用して挙げ、言い換え案も添えてください。',
      context(i),
      bodyBlock(i),
    ].join('\n\n'),
  },
];
