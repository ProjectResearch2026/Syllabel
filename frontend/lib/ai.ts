import { create } from "zustand";

/**
 * AIアシスタントの表示状態。
 * ui-design_phone.pen「★ AI導線マップ」に従い、AI専用ページは持たない。
 * どの画面からでも同じシートが同一画面上にオーバーレイとして開く。
 *
 *   closed : シート非表示（Ask Bar だけが常設されている）        … STEP1〜3
 *   half   : ハーフシート（高さ384・背後の画面とタブバーは見えたまま） … STEP4
 *   full   : フルスクリーン（会話画面・タブバーは非表示）           … STEP5
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

export const TIMETABLE_CONTEXT: AiContext = { kind: "timetable", label: "表示中の時間割" };
export const SYLLABUS_CONTEXT: AiContext = { kind: "syllabus", label: "この検索結果" };

export function slotContext(day: string, period: number): AiContext {
  return { kind: "slot", label: `${day}曜${period}限 の空きコマ`, slot: { day, period } };
}

export function courseContext(name: string, code?: string): AiContext {
  return { kind: "course", label: name, code };
}

type AiStore = {
  mode: AiMode;
  context: AiContext;
  /** Ask Bar に引き継がれる選択状態（科目をタップ中／コマを長押し中） */
  selection: AiContext | null;

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
};

export const useAiStore = create<AiStore>((set) => ({
  mode: "closed",
  context: TIMETABLE_CONTEXT,
  selection: null,

  openHalf: (context) => set({ mode: "half", context }),
  expand: (context) => set((s) => ({ mode: "full", context: context ?? s.context })),
  minimize: () => set({ mode: "half" }),
  // 選択状態（selection）は消さない: 「別ページへ移動した」感を出さないための設計意図
  close: () => set({ mode: "closed" }),
  setSelection: (selection) => set({ selection }),
  setContext: (context) => set({ context }),
}));

/* ------------------------------------------------------------------ */
/* Ask Bar / シートの文言（文脈ごとに差し替わる）                        */
/* ------------------------------------------------------------------ */

/** Ask Bar のプレースホルダ。文脈チップがある場合はチップに続く文になる */
export function askBarPlaceholder(context: AiContext): string {
  switch (context.kind) {
    case "course":
      return "について質問する";
    case "slot":
      return "について質問する";
    case "syllabus":
      return "この検索結果について聞く";
    default:
      return "この時間割について質問する";
  }
}

/** シート下部の入力欄プレースホルダ */
export function sheetInputPlaceholder(context: AiContext): string {
  if (context.slot) return `${context.slot.day}${context.slot.period}について質問する…`;
  if (context.kind === "course") return `${context.label}について質問する…`;
  return "メッセージを入力する";
}

export type AiSuggestion = {
  /** lucide アイコン名 */
  icon: "circle-alert" | "users" | "gauge" | "list-checks" | "calendar-days" | "search";
  title: string;
  sub: string;
  /** タップ時に AI へ送る質問文 */
  prompt: string;
};

/**
 * ハーフシートのサジェスト。入口（文脈）に応じて差し替わる部分。
 * 「コマ」の3件は .pen の STEP4（水3の文脈）に定義されているものをそのまま使う。
 */
export function suggestionsFor(context: AiContext): { label: string; items: AiSuggestion[] } {
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
          icon: "list-checks",
          title: "評価方法と課題の重さ",
          sub: "シラバスの評価割合を要約",
          prompt: `${context.label}の評価方法と課題の量を、シラバスから要約してください。`,
        },
        {
          icon: "search",
          title: "似た科目と比べる",
          sub: "同じ区分の科目と並べて比較",
          prompt: `${context.label}と同じ区分の科目を挙げて、違いを比較してください。`,
        },
      ],
    };
  }

  if (context.kind === "syllabus") {
    return {
      label: "この検索結果について聞けること",
      items: [
        {
          icon: "list-checks",
          title: "この中で必修はどれ？",
          sub: "履修要項と突き合わせて仕分け",
          prompt: "この検索結果のうち、私の課程で必修・選択必修にあたるものはどれですか。",
        },
        {
          icon: "calendar-days",
          title: "いまの時間割に入るものは？",
          sub: "空きコマと重複を確認",
          prompt: "この検索結果のうち、いまの時間割の空きコマに入る科目はどれですか。",
        },
        {
          icon: "gauge",
          title: "単位の埋まり方で並べて",
          sub: "卒業要件に効く順に並べ替え",
          prompt: "この検索結果を、卒業要件に効く順に並べ替えて理由も教えてください。",
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

/** クイックチップ（.pen STEP5 の QuickChips） */
export const AI_QUICK_CHIPS = ["必修を確認", "空きコマを埋めたい", "単位数の相談"] as const;
