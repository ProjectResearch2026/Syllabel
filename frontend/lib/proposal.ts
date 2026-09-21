import { create } from "zustand";
import type { ProposedCourse } from "@/lib/chatApi";

/**
 * 履修提案の受信状態（design.md §5.2.3）。
 *
 * 4値は「提案を持っているか」と「生成中か」を表す。`/proposal` の入力欄の宛先
 * （§8.3.1）と画面の出し分け（§8.3.2）がこの値だけで決まるため、意味を固定する。
 *
 * - `idle`    — **まだ投げていない。** 画面に到達した直後と、再提案で提案を捨てた直後
 * - `loading` — `POST /api/proposal` の応答を受信中。`courses` に入るのは `snapshot`
 *               （§6.1.1）であり確定していない
 * - `done`    — `result` を受け取った。**提案を持っている状態はこれだけである**
 * - `error`   — 生成に失敗した、または前提（課程コード・入学年度・学年）が揃わず投げられない
 */
export type ProposalStatus = "idle" | "loading" | "done" | "error";

type ProposalStore = {
  status: ProposalStatus;
  courses: ProposedCourse[];
  totalCredits: number;
  message: string;
  /**
   * 直前に送った希望条件（§6.1）。再提案では提案チャットの履歴を退避する
   * （§8.3.3）ため、**退避してもなお「前回この条件で頼んだ」ことを示せるのは
   * ここだけ**である。
   */
  preferences: string;

  setStatus: (status: ProposalStatus) => void;
  /**
   * 提案の生成を始める。**前の提案はここで捨てる**（§8.3.3）。`snapshot` は
   * 組み立て途中の部分的な提案であり、前の提案を残したまま重ねると時間割の
   * 各コマが前後の提案の混成になって読めない。
   */
  begin: (preferences: string) => void;
  /**
   * 組み立て途中の提案（`snapshot`）を反映する。status は "loading" のまま据え置き、
   * 時間割表だけを逐次描画させる（design.md §6.1.1 / §7.2）。
   */
  setSnapshot: (courses: ProposedCourse[], totalCredits: number, message: string) => void;
  setResult: (courses: ProposedCourse[], totalCredits: number, message: string) => void;
  /**
   * 再提案のために提案だけを捨てる（§8.3.3）。**`preferences` は残す** —
   * 次の案内に前回の条件を示し、学生が差分だけ書き足せるようにするためである。
   */
  discard: () => void;
  /** リセット（要件§4.8）。学生が書いた希望条件を含め、すべて初期値へ戻す */
  clear: () => void;
};

const EMPTY = {
  status: "idle" as ProposalStatus,
  courses: [] as ProposedCourse[],
  totalCredits: 0,
  message: "",
  preferences: "",
};

export const useProposalStore = create<ProposalStore>((set) => ({
  ...EMPTY,

  setStatus: (status) => set({ status }),
  begin: (preferences) =>
    set({ status: "loading", preferences, courses: [], totalCredits: 0, message: "" }),
  setSnapshot: (courses, totalCredits, message) => set({ courses, totalCredits, message }),
  setResult: (courses, totalCredits, message) =>
    set({ status: "done", courses, totalCredits, message }),
  discard: () => set({ status: "idle", courses: [], totalCredits: 0, message: "" }),
  clear: () => set({ ...EMPTY }),
}));
