import { create } from "zustand";
import type { CourseSlot, ProposedCourse } from "@/lib/chatApi";
import type { HalfTerm } from "@/lib/targetTerm";

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
  /**
   * 講義詳細の「時間割に追加」で、学生が選んだ科目を提案に足す。検査
   * （`checkAddable()`）を通ったものだけを渡すこと。合計単位もここで足す
   */
  addCourse: (course: ProposedCourse) => void;
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
  addCourse: (course) =>
    set((state) => ({
      courses: [...state.courses, course],
      totalCredits: state.totalCredits + (course.credits ?? 0),
    })),
  clear: () => set({ ...EMPTY }),
}));

// 開講学期 → 占めるクォーター。`backend/app/schemas/proposal.py` の `_QUARTERS` と同じ。
// サ集(夏期集中)はクォーターに属さないので載せない
const QUARTERS: Record<string, readonly number[]> = {
  前期: [1, 2],
  後期: [3, 4],
  通年: [1, 2, 3, 4],
  "1Q": [1],
  "2Q": [2],
  "3Q": [3],
  "4Q": [4],
};

function quartersOf(term: string | null | undefined): readonly number[] | null {
  if (!term) return null;
  return QUARTERS[term.normalize("NFKC").replace(/\s/g, "")] ?? null;
}

/** その科目が占めるコマ。`slots` が無ければ1コマ目だけとみなす */
function occupied(course: Pick<ProposedCourse, "slots" | "day" | "period" | "term">): CourseSlot[] {
  if (course.slots && course.slots.length > 0) return course.slots;
  if (course.day && course.period != null)
    return [{ term: course.term, day: course.day, period: course.period }];
  return [];
}

/** 2つのコマが重なるか。`backend` の `slots_clash()` と同じ規則 */
function slotsClash(a: CourseSlot, b: CourseSlot): boolean {
  if (a.day !== b.day || a.period !== b.period) return false;
  const qa = quartersOf(a.term);
  const qb = quartersOf(b.term);
  if (qa && qb) return qa.some((q) => qb.includes(q));
  return a.term === b.term;
}

/**
 * 科目を提案に足せるか。足せないときはその理由を返す（足せるなら null）。
 *
 * 時間割は提案チャットでは組み替えられない（backend の提案チャットは文章で答える
 * だけである。§7.3 規則7）。そこで講義詳細から直接足すが、**提案の生成が
 * 検査しているコマ重複と学期違いはここでも検査する** — 通さずに足すと、
 * 同じマスに2科目が重なった時間割や、対象学期に開講されない科目の入った
 * 時間割ができてしまう。
 */
export function checkAddable(
  course: ProposedCourse,
  current: ProposedCourse[],
  targetTerm: HalfTerm,
): string | null {
  if (course.syllabusCode && current.some((c) => c.syllabusCode === course.syllabusCode)) {
    return "この科目はすでに時間割に入っています。";
  }

  const slots = occupied(course);
  const target = QUARTERS[targetTerm];
  const terms = slots.length > 0 ? slots.map((s) => s.term ?? course.term) : [course.term];
  const quarters = terms.map(quartersOf);
  if (quarters.some((q) => q !== null) && !quarters.some((q) => q?.some((x) => target.includes(x)))) {
    return `この科目は${course.term ?? "対象外の学期"}の開講のため、${targetTerm}の時間割には追加できません。`;
  }

  for (const other of current) {
    const clash = slots.find((s) => occupied(other).some((o) => slotsClash(s, o)));
    if (clash) {
      return `${clash.day}${clash.period}限の「${other.title}」と重なるため追加できません。`;
    }
  }
  return null;
}
