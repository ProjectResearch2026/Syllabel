import { create } from "zustand";
import type { ChatMessage } from "@/lib/chat";
import type { ArchivedChat } from "@/lib/chatHistory";

/**
 * AIアシスタントの表示状態。
 * ui-design_phone.pen「★ AI導線マップ」に従い、AI専用ページは持たない。
 * どの画面からでも同じシートが同一画面上にオーバーレイとして開く。
 *
 *   closed : シート非表示（ボトムドックの Ask Bar だけが常設されている） … STEP1〜3
 *   half   : ハーフシート（背後の画面とタブは見えたまま）                 … STEP4
 *            高さは学生が上部を引っ張って変えられ、変えた高さ（`height`）を覚える
 *   full   : フルスクリーン（会話画面・タブは非表示）                   … STEP5
 *
 * ここは表示状態のみを持つ。対話履歴は lib/chat.ts に置く（AGENTS.md のストア構成に従う）。
 * 永続化は行わない（プライバシー要件）。
 */
export type AiMode = "closed" | "half" | "full";

export type AiContextKind = "timetable" | "course" | "slot" | "syllabus";

export type AiContext = {
  kind: AiContextKind;
  /** 参照中チップに出す文字列（例: 「水曜3限 の空きコマ」「情報理論」） */
  label: string;
  /** 科目文脈のときの講義コード */
  code?: string;
  /** コマ文脈のとき（例: { day: "水", period: 3 }） */
  slot?: { day: string; period: number };
};

export const TIMETABLE_CONTEXT: AiContext = { kind: "timetable", label: "この時間割" };
export const SYLLABUS_CONTEXT: AiContext = { kind: "syllabus", label: "この検索結果" };

export function slotContext(day: string, period: number): AiContext {
  return { kind: "slot", label: `${day}曜${period}限 の空きコマ`, slot: { day, period } };
}

export function courseContext(name: string, code?: string): AiContext {
  return { kind: "course", label: name, code };
}

/**
 * ボトムドックの Ask Bar。**Ask Bar を出す画面だけが登録する**
 * （`MobileAiAssistant` が mount 中に置く）。マイデータ・プライバシーのように
 * AI を持たない画面では null のままで、ドックはタブだけになる。
 */
export type AskDock = {
  /** 選択が無いときの文脈（時間割・検索結果・その講義） */
  base: AiContext;
  /** Ask Bar に出す一言。押すと何が起きるかを書く（会話の `askLabel`） */
  label: string;
};

/** Ask Bar の既定の一言 */
export const DEFAULT_ASK_LABEL = "AIに質問…";

type AiStore = {
  mode: AiMode;
  context: AiContext;
  /** Ask Bar に引き継がれる選択状態（科目・空きコマをタップ中） */
  selection: AiContext | null;
  dock: AskDock | null;
  /**
   * 次に開く時間割で AI をすぐ使えるようにする（取り込み完了の「履修提案を受ける」。
   * design.md §8.3.1）。モバイルはハーフシートを開き、PC は AI パネルの入力欄に
   * フォーカスする。時間割の画面が mount 時に1度だけ読んで下ろす
   */
  openOnArrival: boolean;
  /**
   * 学生が引っ張って決めたハーフシートの高さ(px)。null のあいだは既定の高さ。
   * 閉じて開き直しても、全画面から戻っても、この高さで開く（ページを読み直すと消える）
   */
  height: number | null;

  /** STEP1〜3 → STEP4。文脈を引き継いでハーフシートを開く */
  openHalf: (context: AiContext) => void;
  /** STEP4 → STEP5。自分で質問を書いた／拡大アイコンを押した */
  expand: (context?: AiContext) => void;
  /** STEP5 → STEP4 */
  minimize: () => void;
  /** どの段階からでも元の画面へ戻る（選択状態は保持する） */
  close: () => void;
  /** 画面側の選択状態を Ask Bar に反映する */
  setSelection: (selection: AiContext | null) => void;
  setContext: (context: AiContext) => void;
  setDock: (dock: AskDock | null) => void;
  setOpenOnArrival: (value: boolean) => void;
  setHeight: (height: number | null) => void;
};

export const useAiStore = create<AiStore>((set) => ({
  mode: "closed",
  context: TIMETABLE_CONTEXT,
  selection: null,
  dock: null,
  openOnArrival: false,
  height: null,

  openHalf: (context) => set({ mode: "half", context }),
  expand: (context) => set((s) => ({ mode: "full", context: context ?? s.context })),
  minimize: () => set({ mode: "half" }),
  // 選択状態（selection）は消さない: 「別ページへ移動した」感を出さないための設計意図
  close: () => set({ mode: "closed" }),
  setSelection: (selection) => set({ selection }),
  setContext: (context) => set({ context }),
  setDock: (dock) => set({ dock }),
  setOpenOnArrival: (openOnArrival) => set({ openOnArrival }),
  setHeight: (height) => set({ height }),
}));

/* ------------------------------------------------------------------ */
/* 会話                                                                 */
/* ------------------------------------------------------------------ */

export type AiSuggestion = {
  /** lucide アイコン名 */
  icon: "circle-alert" | "users" | "gauge" | "list-checks" | "calendar-days" | "search";
  title: string;
  sub?: string;
  /** タップ時に AI へ送る質問文 */
  prompt: string;
};

export type AiSuggestions = { label: string; items: AiSuggestion[] };

/**
 * 1つの画面の AI 会話。**PC のパネル（`AiChatPanel`）とモバイルのシート
 * （`MobileAiAssistant`）が同じものを受け取る。** 両者は同じ画面に同時に mount
 * される（表示は CSS で切り替わる）ので、会話は store の同じ系統（§5.2.2）を
 * 読み書きし、どちらから送っても両方が同じ状態を映す。
 */
export type AiConversation = {
  /** ヘッダーに出す一行（例: 「AI履修アシスタント」） */
  title: string;
  messages: ChatMessage[];
  /** 送信中。入力を止め、末尾の吹き出しに指標を出す */
  streaming: boolean;
  /**
   * 本文・思考・進み具合が1つも届いていないあいだの文言（§4.1.4）。既定は「考えています…」
   */
  thinkingLabel?: string;
  placeholder: string;
  /** 送信中ではないが入力を受け付けられない（提案の前提が揃っていないなど。§8.3.2） */
  inputDisabled?: boolean;
  /**
   * 送る。`context` はモバイルのシートが参照中の文脈（科目・コマ）で、
   * 会話の側がそれをどう使うかを決める
   */
  send: (text: string, context?: AiContext) => void;
  /**
   * 末尾の答えを作り直す（Claude の再生成と同じ）。直前の学生の発話を、その手前までの会話に
   * 送り直す。作り直せないとき（送信中・末尾が学生の発話への答えでない）は何もしない。
   * 無ければ再生成のボタンを出さない
   */
  regenerate?: () => void;
  /** 定型の質問 */
  quickAsks?: string[];
  /** モバイルの全画面シートにだけ出す定型の質問（ui-design_phone.pen STEP5 QuickChips） */
  sheetQuickAsks?: string[];
  /**
   * 文章を送るのではなく、その場で何かを起こすボタン（希望条件なしの提案など。§8.3）。
   * `dismissesSheet` は押すとモバイルのシートを閉じる（結果が背後の画面に出るもの）
   */
  actions?: { label: string; onClick: () => void; dismissesSheet?: boolean }[];
  /** ボトムドックの Ask Bar に出す一言。既定は `DEFAULT_ASK_LABEL` */
  askLabel?: string;
  /**
   * 画面全体の文脈（`base`）を「について質問」として出さない。提案前の時間割は
   * 表が空で、参照するものが無い（科目・コマを選んだときは出す）
   */
  hideBaseContext?: boolean;
  /** 入力欄の下に出す断り書き（希望条件の記録についてなど。§9.1） */
  note?: string;
  /** 「最近のチャット」。新しい順 */
  history: ArchivedChat[];
  onSelectHistory: (id: string) => void;
  /** 会話をやり直す。無ければ新規ボタンを出さない */
  onNewChat?: () => void;
  /**
   * モバイルのハーフシートに出すサジェスト（STEP4）。文脈ごとに差し替わる。
   * 返さなければハーフシートでも会話を出す
   */
  suggestionsFor?: (context: AiContext) => AiSuggestions | null;
};

/** 定型の質問をサジェストの形にする（シラバス・講義詳細） */
export function questionSuggestions(label: string, questions: string[]): AiSuggestions | null {
  if (questions.length === 0) return null;
  return {
    label,
    items: questions.map((q) => ({ icon: "search", title: q, prompt: q })),
  };
}

/* ------------------------------------------------------------------ */
/* Ask Bar / シートの文言（文脈ごとに差し替わる）                        */
/* ------------------------------------------------------------------ */

/** シート下部の入力欄プレースホルダ。科目・コマを参照中のときだけ差し替える */
export function sheetInputPlaceholder(context: AiContext, fallback: string): string {
  if (context.slot) return `${context.slot.day}${context.slot.period}について質問する…`;
  if (context.kind === "course") return `${context.label}について質問する…`;
  return fallback;
}

/**
 * 時間割（`/proposal`）のハーフシートのサジェスト。入口（文脈）に応じて差し替わる部分。
 * 「コマ」の3件は .pen の STEP4（水3の文脈）に定義されているものをそのまま使う。
 */
export function timetableSuggestions(context: AiContext): AiSuggestions {
  if (context.kind === "slot") {
    const slot = context.slot!;
    const at = `${slot.day}曜${slot.period}限`;
    return {
      label: "この時間について聞けること",
      items: [
        {
          icon: "circle-alert",
          title: "ここに入る選択必修は？",
          sub: "卒業要件に効く順で候補を表示",
          prompt: `${at}に入れられる選択必修を、卒業要件に効く順で教えてください。`,
        },
        {
          icon: "users",
          title: "他学部の履修可能科目も見る",
          sub: "履修可能な科目を空き状況つきで",
          prompt: `${at}に履修できる他学部の科目を、空き状況つきで教えてください。`,
        },
        {
          icon: "gauge",
          title: "空けたままにするとどうなる？",
          sub: "後の学期への影響を確認",
          prompt: `${at}を空けたままにすると、この先の学期の履修にどんな影響がありますか。`,
        },
      ],
    };
  }

  if (context.kind === "course") {
    return {
      label: `${context.label} について聞けること`,
      items: [
        {
          icon: "circle-alert",
          title: "この科目は卒業要件に効く？",
          sub: "履修要項の区分と残り単位から判定",
          prompt: `${context.label}は卒業要件のどの区分に入り、いま取ると残り単位はどうなりますか。`,
        },
        {
          icon: "users",
          title: "外したら代わりは？",
          sub: "同じコマ・同じ区分の候補",
          prompt: `${context.label}を外すとしたら、代わりに入れられる科目はありますか。`,
        },
        {
          icon: "gauge",
          title: "この科目の重さは？",
          sub: "今期の他の科目と比べて",
          prompt: `${context.label}は、今期の時間割の中で負担が大きいほうですか。`,
        },
      ],
    };
  }

  return {
    label: "この時間割について聞けること",
    items: [
      {
        icon: "circle-alert",
        title: "足りない必修はある？",
        sub: "履修要項と取得済み単位を突き合わせ",
        prompt: "いまの時間割と取得済み単位から、まだ足りていない必修を教えてください。",
      },
      {
        icon: "calendar-days",
        title: "空きコマを埋めたい",
        sub: "空いているコマの候補をまとめて",
        prompt: "いまの時間割で空いているコマに入れられる科目を、まとめて提案してください。",
      },
      {
        icon: "gauge",
        title: "この単位数で大丈夫？",
        sub: "卒業までのペースを確認",
        prompt: "今期の登録単位数で、卒業までのペースは足りていますか。",
      },
    ],
  };
}

/** 時間割の全画面シートのクイックチップ（.pen STEP5 の QuickChips） */
export const TIMETABLE_QUICK_ASKS = ["必修を確認", "空きコマを埋めたい", "単位数の相談"];
