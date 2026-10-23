import { create } from "zustand";
import type {
  BuiltTimetable,
  ProposedCourse,
  TimetableConditions,
  TimetableReport,
  TimetableStep,
} from "@/lib/chatApi";
import type { SyllabusDetail } from "@/lib/syllabus-api";
import { DAYS } from "@/lib/timetable";
import { categoryOf, subcategoryOf } from "@/lib/courseLabels";
import type { CourseTags } from "@/lib/syllabusUI";

/**
 * 時間割の状態（design.md §5.2.3）。
 *
 * - `idle`    — **まだ時間割が無い。** 画面に到達した直後
 * - `loading` — 時間割を組んでいる。組み立ての手順（`step`。§6.1.1）を1手ずつ描いている
 *               あいだも含む。`courses` は組み上がる途中であり確定していない
 * - `done`    — 組み上がった、または学生が自分で科目を登録した。
 *               **時間割を持っている状態はこれだけである**
 * - `error`   — 組み立てに失敗した
 *
 * アシスタントが応答しているか（`busy`）はこれと別に持つ。質問に答えているだけのときも
 * 時間割の編集を止める — 応答の途中で組み直しが届くと、編集が上書きされるためである。
 */
export type ProposalStatus = "idle" | "loading" | "done" | "error";

/**
 * 時間割の科目の同一性。シラバスコードが無い科目(AI が特定できなかった科目)は
 * 科目名で見分ける。時間割表の `entryKey()`(`app/_components/TimetableGrid.tsx`)と同じ規則
 */
export function courseKey(course: { syllabusCode: string | null; title: string }): string {
  return course.syllabusCode ?? course.title;
}

/**
 * 学生が自分で登録した科目に付ける理由。アシスタントにもこのまま渡る。組み立てが
 * 学生の科目を見分けるのは理由の文言ではなく `source: "student"` である
 */
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
    source: "student",
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

/** 組み立ての1手を時間割に当てる。科目の出し入れだけで、`free_day` などの科目の無い手は表を変えない */
function applyStep(courses: ProposedCourse[], step: TimetableStep): ProposedCourse[] {
  const course = step.course;
  if (!course) return courses;
  const key = courseKey(course);
  if (step.kind === "remove") return courses.filter((c) => courseKey(c) !== key);
  if (courses.some((c) => courseKey(c) === key)) return courses;
  return [...courses, course];
}

/** 組み立ての1手を、時間割の上に出す一言にする（§8.3.7） */
export function stepLabel(step: TimetableStep): string | null {
  const title = step.course?.title;
  switch (step.kind) {
    case "keep":
      return title ? `${title}を残す` : null;
    case "remove":
      return title ? `${title}を外す${step.note ? `（${step.note}）` : ""}` : null;
    case "required":
      return title ? `${step.note === "再履修" ? "再履修" : "必修"}: ${title}` : null;
    case "include":
      return title ? `${title}を入れる` : null;
    case "free_day":
      return step.day ? `${step.day}曜を全休にする` : null;
    case "fill":
      if (!title) return null;
      if (!step.slot) return `${title}を足す`;
      return `${step.slot}を埋める: ${title}${
        step.shortfallAfter != null ? `（残り${step.shortfallAfter}単位）` : ""
      }`;
    case "unmet":
      return step.condition ? `満たせない条件: ${step.condition}` : null;
  }
}

type ProposalStore = {
  status: ProposalStatus;
  courses: ProposedCourse[];
  totalCredits: number;
  /** 直近の組み立てについて backend が作った説明（「希望条件なしで提案する」の吹き出し） */
  message: string;
  /**
   * 時間割の形についての条件（§6.1）。アシスタントの `conditions` イベントと
   * `/api/timetable/build` の応答で差し替え、次のリクエストに載せる
   */
  conditions: TimetableConditions;
  /**
   * 時間割についての事実（§6.1）。画面には出さない — 満たせなかった条件と確かめることは
   * アシスタントの説明と「希望条件なしで提案する」の吹き出しが伝える（§8.3.7）
   */
  report: TimetableReport | null;
  /**
   * 学生が手で時間割を直し、`report` が今の時間割のものでなくなった。時間割の画面が
   * `/api/timetable/check` で引き直す（講義詳細から登録したときは、戻ってきたときに引く）
   */
  reportStale: boolean;
  /** 組み立ての途中に表の上に出す一言（「専門応用科目(選択)を埋める: …」） */
  stepLabel: string | null;
  /** アシスタントが応答している。時間割の編集を止める */
  busy: boolean;
  /** 「別の科目に変更」の途中。シラバスで選んだ科目がこの科目と入れ替わる */
  replacing: ReplaceTarget | null;

  setBusy: (busy: boolean) => void;
  /**
   * 組み立てを始める。**前の時間割はまだ残す** — `/api/timetable/build` の応答を
   * 待つあいだに表が空になると、失敗したときに元へ戻せない。手順を描き始めるときに
   * `startSteps()` で残す科目だけにする
   */
  beginBuild: () => void;
  /**
   * 手順を描き始める。表を `kept`(先頭の「残す」手の科目)だけにし、以後の手順で
   * 1科目ずつ出し入れする。**残す科目は前の表の科目と並びのまま置く** — 表を空にして
   * 入れ直すと、組み直しのたびに時間割が一度消えて見える(`lib/timetableBuild.ts`)
   */
  startSteps: (kept: ProposedCourse[]) => void;
  /** 組み立ての1手を描く（§8.3.7） */
  playStep: (step: TimetableStep) => void;
  /** 組み上がった時間割で確定する。手順で描いた途中の表はこれで置き換わる */
  finishBuild: (built: BuiltTimetable, message?: string) => void;
  /** 組み立てを取りやめる。始める前の時間割へ戻す */
  cancelBuild: (previous: Pick<ProposalStore, "status" | "courses" | "totalCredits">) => void;
  setConditions: (conditions: TimetableConditions) => void;
  setReport: (report: TimetableReport) => void;
  /** リセット（要件§4.8）。すべて初期値へ戻す */
  clear: () => void;

  /**
   * 学生が時間割を直接編集する。**組み立ての途中とアシスタントの応答中は受け付けない**
   * — 届く時間割に上書きされて編集が消えるためである。時間割が無いとき（`idle`）や
   * 失敗後（`error`）に登録したときは、その時間割を持った状態（`done`）にする。
   *
   * 単位の和（`totalCredits`）は編集のたびに科目から数え直す。卒業要件の見込みは
   * `courses` に追従するので、ここを書き換えれば画面の数字もついてくる（§8.3.5）。
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
  conditions: {} as TimetableConditions,
  report: null as TimetableReport | null,
  reportStale: false,
  stepLabel: null as string | null,
  busy: false,
  replacing: null as ReplaceTarget | null,
};

/** 編集後の時間割。編集で時間割を持った状態になり、レポートは引き直しになる */
function edited(courses: ProposedCourse[]) {
  return {
    status: "done" as ProposalStatus,
    courses,
    totalCredits: sumCredits(courses),
    reportStale: true,
  };
}

/** 編集を受け付けない状態 */
function locked(s: Pick<ProposalStore, "status" | "busy">): boolean {
  return s.status === "loading" || s.busy;
}

export const useProposalStore = create<ProposalStore>((set) => ({
  ...EMPTY,

  setBusy: (busy) => set({ busy }),
  beginBuild: () =>
    set({ status: "loading", stepLabel: "時間割を組んでいます", replacing: null }),
  startSteps: (kept) =>
    set((s) => {
      const keys = new Set(kept.map(courseKey));
      const held = s.courses.filter((c) => keys.has(courseKey(c)));
      const heldKeys = new Set(held.map(courseKey));
      const courses = [...held, ...kept.filter((c) => !heldKeys.has(courseKey(c)))];
      return { courses, totalCredits: sumCredits(courses) };
    }),
  playStep: (step) =>
    set((s) => {
      const courses = applyStep(s.courses, step);
      return {
        courses,
        totalCredits: sumCredits(courses),
        stepLabel: stepLabel(step) ?? s.stepLabel,
      };
    }),
  finishBuild: (built, message) =>
    set((s) => ({
      status: "done",
      courses: built.courses,
      totalCredits: built.totalCredits,
      report: built.report,
      reportStale: false,
      message: message ?? s.message,
      stepLabel: null,
    })),
  cancelBuild: (previous) => set({ ...previous, stepLabel: null }),
  setConditions: (conditions) => set({ conditions }),
  setReport: (report) => set({ report, reportStale: false }),
  clear: () => set({ ...EMPTY }),

  addCourse: (course) =>
    set((s) => {
      if (locked(s)) return {};
      const key = courseKey(course);
      if (s.courses.some((c) => courseKey(c) === key)) return {};
      return edited([...s.courses, course]);
    }),
  removeCourse: (key) =>
    set((s) => {
      if (locked(s)) return {};
      return edited(s.courses.filter((c) => courseKey(c) !== key));
    }),
  replaceCourse: (key, course) =>
    set((s) => {
      if (locked(s)) return {};
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
