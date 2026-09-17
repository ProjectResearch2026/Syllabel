import { create } from "zustand";
import type { ChatMessage } from "@/lib/chat";

/**
 * 会話履歴（ui-design_pc.pen Chat/HistoryMenu）。
 *
 * チャットパネルのハンバーガーから開く「最近のチャット」の中身。
 *
 * **いま話している会話は `useChatStore` に置いたままにする。** ここが持つのは
 * 「新しい会話を始めたとき」「別の会話へ切り替えたとき」に脇へどけた**過去の分**
 * だけである。現在の会話まで移すと、既存の各画面（モバイルのシート・提案画面・
 * 講義チャット）がメッセージを読む先を全部書き換えることになり、
 * 見た目の追加に対して壊す範囲が大きすぎる。
 *
 * **ここも永続化しない**（要件§5 / 設計§9）。学生の対話履歴はブラウザのメモリに
 * だけ置き、リロードやタブを閉じた時点で消える。`localStorage` には書かない。
 *
 * 画面ごとに別の会話列を持つため、`scope` で分ける（時間割の提案チャットと
 * 講義ごとのチャットが1つの履歴に混ざると、どれがどの話か分からなくなる）。
 */

/** 履歴の区切り。講義チャットは講義ごとに分ける */
export type ChatScope = "proposal" | "syllabus" | `course:${string}`;

export type ArchivedChat = {
  id: string;
  /** 一覧に出す見出し。最初のユーザー発言から作る */
  title: string;
  messages: ChatMessage[];
  /** 並び順のためだけに持つ。画面には出さない */
  updatedAt: number;
};

/** 一覧に収まる長さへ詰める。設計の項目は1行（13px/18px, 300px幅） */
const TITLE_MAX = 28;

/**
 * 会話の見出しを作る。**最初のユーザー発言を使う。**
 * AIの1行目は画面ごとに同じ定型文（「条件を言葉で伝えてください。」など）で、
 * 見出しにすると履歴が全部同じ文言で並んでしまう。
 *
 * @returns ユーザーがまだ何も言っていなければ null（履歴に残す意味が無い）
 */
export function titleOf(messages: ChatMessage[]): string | null {
  const first = messages.find((m) => m.role === "user" && m.content.trim());
  if (!first) return null;
  const text = first.content.trim().replace(/\s+/g, " ");
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX)}…` : text;
}

type ChatHistoryStore = {
  /** scope → 新しい順の過去の会話 */
  history: Record<string, ArchivedChat[]>;

  /**
   * いまの会話を履歴へしまう。ユーザーがまだ何も言っていなければ何もしない。
   * @returns しまったなら true
   */
  archive: (scope: ChatScope, messages: ChatMessage[]) => boolean;

  /** 履歴から取り出して一覧から外す。無ければ null */
  restore: (scope: ChatScope, id: string) => ChatMessage[] | null;

  clearScope: (scope: ChatScope) => void;
  clearAll: () => void;
};

export const useChatHistoryStore = create<ChatHistoryStore>((set, get) => ({
  history: {},

  archive: (scope, messages) => {
    const title = titleOf(messages);
    if (!title) return false;
    const entry: ArchivedChat = {
      // crypto.randomUUID は https / localhost でしか無い。時刻＋乱数で足りる
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      // ストリーミング中の吹き出しはそのまま残すと「▌」が居座る。畳んでおく
      messages: messages.map((m) => ({ ...m, streaming: false })),
      updatedAt: Date.now(),
    };
    set((state) => ({
      history: { ...state.history, [scope]: [entry, ...(state.history[scope] ?? [])] },
    }));
    return true;
  },

  restore: (scope, id) => {
    const list = get().history[scope] ?? [];
    const found = list.find((c) => c.id === id);
    if (!found) return null;
    set((state) => ({
      history: {
        ...state.history,
        [scope]: (state.history[scope] ?? []).filter((c) => c.id !== id),
      },
    }));
    return found.messages;
  },

  clearScope: (scope) =>
    set((state) => {
      const next = { ...state.history };
      delete next[scope];
      return { history: next };
    }),

  clearAll: () => set({ history: {} }),
}));

/** セレクタが毎回新しい配列を返すと再描画が止まらない。空は共有する */
const EMPTY: ArchivedChat[] = [];

/** パネルから使う一式。`scope` を1回書けば済むようにまとめる */
export function useChatHistory(scope: ChatScope) {
  const entries = useChatHistoryStore((s) => s.history[scope] ?? EMPTY);
  const archive = useChatHistoryStore((s) => s.archive);
  const restore = useChatHistoryStore((s) => s.restore);
  return { entries, archive, restore };
}
