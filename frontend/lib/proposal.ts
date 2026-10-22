import { create } from "zustand";
import type { ProposedCourse } from "@/lib/chatApi";
import type { SyllabusDetail } from "@/lib/syllabus-api";
import { DAYS } from "@/lib/timetable";
import { categoryOf, subcategoryOf } from "@/lib/courseLabels";
import type { CourseTags } from "@/lib/syllabusUI";

/**
 * 履修提案の受信状態（design.md §5.2.3）。
 *
 * 4値は「提案を持っているか」と「生成中か」を表す。`/proposal` の入力欄の宛先
 * （§8.3.1）と画面の出し分け（§8.3.2）がこの値だけで決まるため、意味を固定する。
 *
 * - `idle`    — **まだ投げていない。** 画面に到達した直後と、再提案で提案を捨てた直後
 * - `loading` — `POST /api/proposal` の応答を受信中。`courses` に入るのは `snapshot`
 *               （§6.1.1）であり確定していない
 * - `done`    — `result` を受け取った、または学生が自分で科目を登録した。
 *               **時間割を持っている状態はこれだけである**
 * - `error`   — 生成に失敗した、または前提（課程コード・入学年度・学年）が揃わず投げられない
 */
export type ProposalStatus = "idle" | "loading" | "done" | "error";

/**
 * 時間割の科目の同一性。シラバスコードが無い科目(AI が特定できなかった科目)は
 * 科目名で見分ける。時間割表の `entryKey()`(`app/_components/TimetableGrid.tsx`)と同じ規則
 */
export function courseKey(course: { syllabusCode: string | null; title: string }): string {
  return course.syllabusCode ?? course.title;
}

/** 学生が自分で登録した科目に付ける理由。提案チャットにもこのまま渡る */
export const MANUAL_REASON = "学生が自分で時間割に登録した科目";

/**
 * シラバス(講義詳細)から時間割の科目を作る。`tags` はその科目のタグ(§8.2.1)で、
 * 区分・分野・履修区分を履修要項の表記に戻して載せる。タグが出ない科目はどれも null
 */
export type SyllabusForTimetable = Pick<
  SyllabusDetail,
  "syllabus_code" | "course_title" | "slots" | "day_of_week" | "period" | "term_name" | "credits"
>;

export function courseFromSyllabus(
  syllabus: SyllabusForTimetable,
  tags: Pick<CourseTags, "category" | "subcategory" | "requirement">,
): ProposedCourse {
  const slots = (syllabus.slots ?? []).flatMap((s) =>
    (DAYS as readonly string[]).includes(s.day)
      ? [{ term: s.term, day: s.day as NonNullable<ProposedCourse["day"]>, period: s.period }]
      : [],
  );
  const first = slots[0];
  const day = (DAYS as readonly string[]).includes(syllabus.day_of_week)
    ? (syllabus.day_of_week as NonNullable<ProposedCourse["day"]>)
    : null;
  return {
    syllabusCode: syllabus.syllabus_code,
    title: syllabus.course_title,
    day: first?.day ?? day,
    period: first?.period ?? (day && syllabus.period ? syllabus.period : null),
    term: first?.term ?? (syllabus.term_name || null),
    slots,
    credits: syllabus.credits,
    category: tags.requirement,
    courseCategory: categoryOf(tags.category),
    subcategory: subcategoryOf(tags.subcategory),
    reason: MANUAL_REASON,
  };
}

/** 入れ替え(「別の科目に変更」)で外す科目。シラバスで次の科目を選ぶあいだ持つ */
export type ReplaceTarget = {
  key: string;
  title: string;
  /** 押したマス。シラバスをこの曜日・時限で絞って開く */
  day?: string;
  period?: number;
};

function sumCredits(courses: ProposedCourse[]): number {
  return courses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
}

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
  /** 「別の科目に変更」の途中。シラバスで選んだ科目がこの科目と入れ替わる */
  replacing: ReplaceTarget | null;

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

  /**
   * 学生が時間割を直接編集する。**提案の生成中は受け付けない** — 届く snapshot に
   * 上書きされて編集が消えるためである。提案の前(`idle`)や失敗後(`error`)に
   * 登録したときは、その時間割を持った状態(`done`)にする。
   *
   * 単位の和(`totalCredits`)は編集のたびに科目から数え直す。卒業要件の見込みは
   * `courses` に追従するので、ここを書き換えれば画面の数字もついてくる(§8.3.5)。
   */
  addCourse: (course: ProposedCourse) => void;
  removeCourse: (key: string) => void;
  /** `key` の科目を `course` に入れ替える。入れ替えが済めば `replacing` も外す */
  replaceCourse: (key: string, course: ProposedCourse) => void;
  startReplace: (target: ReplaceTarget) => void;
  cancelReplace: () => void;
};

const EMPTY = {
  status: "idle" as ProposalStatus,
  courses: [] as ProposedCourse[],
  totalCredits: 0,
  message: "",
  preferences: "",
  replacing: null as ReplaceTarget | null,
};

/** 編集後の時間割。編集で時間割を持った状態になる */
function edited(courses: ProposedCourse[]) {
  return { status: "done" as ProposalStatus, courses, totalCredits: sumCredits(courses) };
}

export const useProposalStore = create<ProposalStore>((set) => ({
  ...EMPTY,

  setStatus: (status) => set({ status }),
  begin: (preferences) =>
    set({ status: "loading", preferences, courses: [], totalCredits: 0, message: "", replacing: null }),
  setSnapshot: (courses, totalCredits, message) => set({ courses, totalCredits, message }),
  setResult: (courses, totalCredits, message) =>
    set({ status: "done", courses, totalCredits, message }),
  discard: () => set({ status: "idle", courses: [], totalCredits: 0, message: "", replacing: null }),
  clear: () => set({ ...EMPTY }),

  addCourse: (course) =>
    set((s) => {
      if (s.status === "loading") return {};
      const key = courseKey(course);
      if (s.courses.some((c) => courseKey(c) === key)) return {};
      return edited([...s.courses, course]);
    }),
  removeCourse: (key) =>
    set((s) => {
      if (s.status === "loading") return {};
      return edited(s.courses.filter((c) => courseKey(c) !== key));
    }),
  replaceCourse: (key, course) =>
    set((s) => {
      if (s.status === "loading") return {};
      const nextKey = courseKey(course);
      // 元の科目の位置に入れる。入れ替え先がすでに時間割にあれば二重に持たない
      const courses = s.courses.flatMap((c) => {
        const k = courseKey(c);
        if (k === key) return [course];
        return k === nextKey ? [] : [c];
      });
      if (!s.courses.some((c) => courseKey(c) === key)) courses.push(course);
      return { ...edited(courses), replacing: null };
    }),
  startReplace: (target) => set({ replacing: target }),
  cancelReplace: () => set({ replacing: null }),
}));
