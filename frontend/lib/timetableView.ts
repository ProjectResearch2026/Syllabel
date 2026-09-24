import { create } from "zustand";

/** モバイルの時間割の見せ方。週表示（グリッド）か曜日表示（縦のリスト） */
export type TimetableView = "week" | "day";

type TimetableViewStore = {
  view: TimetableView;
  setView: (view: TimetableView) => void;
};

/**
 * モバイルの時間割で最後に選んだ見せ方（ui-design_phone.pen 04-3 の「週｜曜日」）。
 *
 * **メモリにだけ持つ**（`persist` を使わない。frontend/AGENTS.md のプライバシー上の制約）。
 * シラバスや講義詳細へ行って戻っても選んだ見せ方のままで、リロードすると週表示に戻る。
 */
export const useTimetableView = create<TimetableViewStore>((set) => ({
  view: "week",
  setView: (view) => set({ view }),
}));

/** 曜日表示で最初に開く曜日。今日の曜日で、日曜は月曜にする */
export function todayWeekday(): string {
  return ["月", "月", "火", "水", "木", "金", "土"][new Date().getDay()];
}
