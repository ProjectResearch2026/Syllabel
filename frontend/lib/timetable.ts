export const DAYS = ["月", "火", "水", "木", "金", "土"] as const;
export const PERIODS = [1, 2, 3, 4, 5] as const;

export type Day = (typeof DAYS)[number];
export type Period = (typeof PERIODS)[number];

/**
 * 科目区分。ui-design_phone.pen の時間割セルは 必修 / 選択必修 / 選択 の3種を出し分ける。
 * done（既修得）はシラバス側のタグで使う。
 */
export type CourseType = "required" | "selective" | "elective" | "done";

/** 時間割のコマ1つ(曜日・時限)。学期は `ProposedCourse.slots` 側が持つ */
export type SlotPosition = { day: string; period: number };

export type CourseCell = {
  name: string;
  type: CourseType;
  code?: string;
  teacher?: string;
  credits?: number;
  /**
   * その科目が占めるコマのすべて。「金4・金5」のように複数コマの科目は、
   * **同じセル(同じオブジェクト)** がそれぞれのマスに入る(`coursesToTimetable()`)
   */
  slots?: SlotPosition[];
} | null;

export type Timetable = Record<number, Record<string, CourseCell>>;

/**
 * 区分ごとの見た目。値は ui-design_phone.pen のセル／タグ／時間バッジの塗りに対応する。
 *  cell  : 時間割セルの地色
 *  tag   : セル内タグ（濃色地・白文字）
 *  badge : リスト行の時間バッジ地色
 *  pill  : リスト行のタグ（丸型）
 */
export const CELL_STYLES: Record<CourseType, {
  cell: string;
  tag: string;
  badge: string;
  pill: string;
  label: string;
}> = {
  required: {
    cell: "bg-cell-required",
    tag: "bg-required-tag text-fg-inverse",
    badge: "bg-badge-required",
    pill: "bg-required-tag text-fg-inverse",
    label: "必修",
  },
  selective: {
    cell: "bg-cell-selective",
    tag: "bg-elective-tag text-fg-inverse",
    badge: "bg-badge-selective",
    pill: "bg-elective-tag text-fg-inverse",
    label: "選択必修",
  },
  elective: {
    cell: "bg-cell-elective",
    tag: "bg-fg-secondary text-fg-inverse",
    badge: "bg-badge-elective",
    pill: "bg-tag-elective-bg text-fg-secondary",
    label: "選択",
  },
  done: {
    cell: "bg-cell-free",
    tag: "bg-done-tag text-fg-inverse",
    badge: "bg-badge-elective",
    pill: "bg-done-tag text-fg-inverse",
    label: "既修得",
  },
};

/**
 * 時間割を曜日順（曜日 → 限）のフラットな配列にする。登録予定の科目リスト用。
 *
 * 複数コマの科目は複数のマスに同じセルが入っているので、**最初に出てきたマスで1回だけ**
 * 数える。マスごとに数えると「金4・金5」の科目が2行になり、単位も2倍に数えてしまう。
 */
export function toCourseList(
  timetable: Timetable,
): { day: Day; period: Period; course: NonNullable<CourseCell> }[] {
  const rows: { day: Day; period: Period; course: NonNullable<CourseCell> }[] = [];
  const seen = new Set<NonNullable<CourseCell>>();
  for (const day of DAYS) {
    for (const period of PERIODS) {
      const course = timetable[period]?.[day];
      if (!course || seen.has(course)) continue;
      seen.add(course);
      rows.push({ day, period, course });
    }
  }
  return rows;
}

/**
 * 科目が占めるコマ。`slots`(全コマ。design.md §5.3)を使い、無ければ `day` / `period`
 * (1コマ目)の1コマとする。`slots` を返さない旧い backend への備え。
 */
export function occupiedSlots(course: {
  day: string | null;
  period: number | null;
  slots?: SlotPosition[];
}): SlotPosition[] {
  if (course.slots && course.slots.length > 0) {
    return course.slots.map(({ day, period }) => ({ day, period }));
  }
  return course.day && course.period != null ? [{ day: course.day, period: course.period }] : [];
}

/**
 * 時間バッジ(曜日の上段・時限の下段)に書く文字。複数コマは「金 / 4・5」、
 * 曜日が違えば「月・木 / 1・4」と、どちらも「・」でつなぐ。
 */
export function slotBadge(slots: SlotPosition[]): { day: string; period: string } | null {
  if (slots.length === 0) return null;
  const days = [...new Set(slots.map((s) => s.day))];
  const periods = slots.map((s) => String(s.period));
  return {
    day: days.join("・"),
    period: (days.length === 1 ? [...new Set(periods)] : periods).join("・"),
  };
}

/**
 * 履修区分（design.md §5.3 の `category`）を時間割セルの表示区分に対応づける。
 * 区分が不明（null）な科目は選択として描く。
 */
export function categoryToCourseType(category: string | null | undefined): CourseType {
  if (category === "必修") return "required";
  if (category === "選択必修") return "selective";
  return "elective";
}

/**
 * 提案結果（ProposedCourse[]）を時間割の形に組み替える。design.md §5.3。
 *
 * 曜日・時限が null の科目（集中講義・未定）はグリッドに置けないため除く。
 * 複数コマの科目(「金4・金5」)は**全部のマス**に置く(`occupiedSlots()`)。
 */
export function coursesToTimetable(
  courses: {
    title: string;
    day: string | null;
    period: number | null;
    slots?: SlotPosition[];
    category: string | null;
    syllabusCode: string | null;
    credits: number | null;
  }[],
): Timetable {
  const timetable: Timetable = {};
  for (const course of courses) {
    const slots = occupiedSlots(course);
    if (slots.length === 0) continue;
    // どのマスにも同じオブジェクトを入れる。科目リストはこれで1科目1行に数える
    const cell: NonNullable<CourseCell> = {
      name: course.title,
      type: categoryToCourseType(course.category),
      code: course.syllabusCode ?? undefined,
      credits: course.credits ?? undefined,
      slots,
    };
    for (const { day, period } of slots) {
      if (!timetable[period]) timetable[period] = {};
      timetable[period][day] = cell;
    }
  }
  return timetable;
}
