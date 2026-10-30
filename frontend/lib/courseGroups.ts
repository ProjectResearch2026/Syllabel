import { normalizeTitle } from "@/lib/courseTitle";
import { CATEGORY_LABEL } from "@/lib/courseLabels";
import {
  isUnmatched,
  shortSlotName,
  type SlotStatus,
  type UncountedCourse,
  type UncountedReason,
} from "@/lib/requirements";
import type { Course } from "@/lib/student";
import type { CurriculaCourse } from "@/lib/syllabus-api";

/**
 * マイデータの修得済み科目を、卒業要件の枠ごとに並べ直す。design.md §8.4.1。
 *
 * **枠への割り当ては判定(`POST /api/requirements`)の `slots[].courses` と `uncounted` を
 * 科目名で引き戻すだけで、手元で判定し直さない。** 枠の中の並びも判定が返した順(判定に
 * 送った科目の順)のままにする。
 */

/** 枠に並べる科目1件。`credits` はその枠に数えた単位で、科目の単位と違えば分かれている */
export type GroupedCourse = {
  course: Course;
  credits: number;
  /**
   * 区分の表示名。学部フリーゾーン・オールフリーゾーンに並ぶ科目だけが持つ
   * (専門関連科目や、枠からあふれた専門科目がそこに入るため、何の科目か分からなくなる)
   */
  category: string | null;
};

export type SlotGroup = {
  key: string;
  /** 帯と同じ短い名前(`shortSlotName()`) */
  name: string;
  /** 公式の区分名。ツールチップに出す */
  fullName: string;
  earned: number;
  required: number;
  courses: GroupedCourse[];
};

/** 卒業要件に数えなかった科目1件。`course` は対応する成績表の行(見つからなければ null) */
export type UncountedGroupItem = {
  title: string;
  credits: number;
  reason: UncountedReason;
  course: Course | null;
};

/** 科目ごとに返る理由(同じ名前の科目の行ごとに1つ)。ほかの理由は枠への割り当ての結果 */
const ROW_REASONS: ReadonlySet<UncountedReason> = new Set([
  "not_in_curriculum",
  "excluded_type",
  "duplicate",
]);

/** 学部フリーゾーン・オールフリーゾーン。入る科目の区分がまちまちなので、科目に区分を添える */
function isFreeZone(key: string): boolean {
  return key.startsWith("free.");
}

/**
 * 区分の表示名。他課程から導出した科目(`own: false`)は専門関連科目で、その `type` は導出元の
 * 課程にとっての区分なので出さない(§8.2.1 のタグと同じ規則)
 */
function categoryLabel(course: CurriculaCourse | undefined): string | null {
  if (!course) return null;
  if (!course.own || course.category === "専門関連科目") return CATEGORY_LABEL.専門関連科目;
  return `${CATEGORY_LABEL[course.category]}(${course.type})`;
}

/**
 * 修得済みの科目を枠ごとにまとめる。
 *
 * @param courses 判定に送ったプロファイルの科目(送った順のまま)
 * @param slotKeys 並べる枠の key。帯と同じ並び(`RequirementsView` の `slots` の順)で渡す
 * @param counted 判定の全枠(`RequirementsView` の `counted`)
 * @param uncounted 判定が数えなかった科目
 * @param curriculum 区分を引く履修要項の科目。引けないあいだは空でよい(区分を添えないだけ)
 *
 * 判定は合格した科目を送った順に見て、履修要項に無い・随意の科目は行ごとに数えず、同じ名前の
 * 2行目以降を `duplicate` にする(`app/curricula/requirements.py` の `_collect()`)。そのため
 * 同じ名前の科目は、最初の行が枠への割り当て(と上限・余剰で数えなかった分)を受け取り、
 * 残りの行が `duplicate` を受け取る。
 */
export function groupCoursesBySlot(
  courses: Course[],
  slotKeys: string[],
  counted: SlotStatus[],
  uncounted: UncountedCourse[],
  curriculum: CurriculaCourse[],
): { slots: SlotGroup[]; uncounted: UncountedGroupItem[] } {
  const passedRows = new Map<string, Course[]>();
  for (const course of courses) {
    if (course.status !== "passed") continue;
    const title = normalizeTitle(course.title);
    passedRows.set(title, [...(passedRows.get(title) ?? []), course]);
  }
  const categories = new Map(curriculum.map((c) => [normalizeTitle(c.title), c]));

  // 判定が枠に割り当てた(または上限・余剰で数えなかった)科目名。その最初の行が割り当てを受け取る
  const assignedTitles = new Set<string>();
  for (const slot of counted) for (const c of slot.courses) assignedTitles.add(normalizeTitle(c.title));
  for (const u of uncounted) if (!ROW_REASONS.has(u.reason)) assignedTitles.add(normalizeTitle(u.title));
  // 科目ごとに返る理由を受け取る行。割り当てを受けた名前なら2行目以降、そうでなければ全行
  const rowQueue = new Map<string, Course[]>();
  for (const [title, rows] of passedRows) {
    rowQueue.set(title, assignedTitles.has(title) ? rows.slice(1) : [...rows]);
  }
  const unitRow = (title: string) => passedRows.get(title)?.[0] ?? null;

  const byKey = new Map(counted.map((s) => [s.key, s]));
  const slots = slotKeys.flatMap((key): SlotGroup[] => {
    const slot = byKey.get(key);
    if (!slot) return [];
    return [
      {
        key,
        name: shortSlotName(slot.name),
        fullName: slot.name,
        earned: slot.earned,
        required: slot.required,
        courses: slot.courses.flatMap((c): GroupedCourse[] => {
          const title = normalizeTitle(c.title);
          const course = unitRow(title);
          if (!course) return [];
          return [
            {
              course,
              credits: c.credits,
              category: isFreeZone(key) ? categoryLabel(categories.get(title)) : null,
            },
          ];
        }),
      },
    ];
  });

  const items = uncounted.map((u): UncountedGroupItem => {
    const title = normalizeTitle(u.title);
    const course = ROW_REASONS.has(u.reason) ? (rowQueue.get(title)?.shift() ?? null) : unitRow(title);
    return { title: u.title, credits: u.credits, reason: u.reason, course };
  });
  // 突き合わせられなかった科目を先に並べる(余剰に埋もれさせない)。それぞれの中は判定の順のまま
  const ordered = [...items.filter((i) => isUnmatched(i.reason)), ...items.filter((i) => !isUnmatched(i.reason))];

  return { slots, uncounted: ordered };
}
