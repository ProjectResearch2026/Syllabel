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

/** PC の時間割表の1マスに置く科目1件。1マスに複数入り得る(`coursesToSlotTable()`) */
export type SlotEntry = {
  name: string;
  type: CourseType;
  code?: string;
  credits?: number;
  /**
   * そのマスを占める期間がクォーターのときの印(「3Q」「3Q・4Q」)。学期いっぱい
   * (前期・後期・通年、または 1Q・2Q / 3Q・4Q の両方)なら付けない
   */
  quarter?: string;
};

/** 期(period) → 曜日 → そのマスの科目(クォーター順) */
export type SlotTable = Record<number, Record<string, SlotEntry[]>>;

const QUARTERS = ["1Q", "2Q", "3Q", "4Q"] as const;

/** 全角の `３Ｑ` なども含めてクォーター名に寄せる。クォーターでなければ null */
function quarterOf(term: string | null | undefined): string | null {
  if (!term) return null;
  const key = term.normalize("NFKC").replace(/\s/g, "");
  return (QUARTERS as readonly string[]).includes(key) ? key : null;
}

/** そのマスで科目が占めるクォーターの印。学期いっぱいを占めるなら undefined */
function quarterLabel(terms: (string | null | undefined)[]): string | undefined {
  const quarters = terms.map(quarterOf);
  // 学期名(後期など)のコマが1つでもあれば学期いっぱい
  if (quarters.some((q) => q === null)) return undefined;
  const unique = QUARTERS.filter((q) => quarters.includes(q));
  const fullHalf =
    (unique.includes("1Q") && unique.includes("2Q")) || (unique.includes("3Q") && unique.includes("4Q"));
  return fullHalf ? undefined : unique.join("・");
}

/**
 * 提案結果を PC の時間割表の形に組み替える。design.md §5.3 / §8.3。
 *
 * `coursesToTimetable()` と違い、**1マスに複数の科目を持てる**。3Q と 4Q の科目は
 * 同じマスに並び得る(重複ではない)ため、1マス1科目では後から来た科目で上書きされ、
 * 提案の科目が画面から消えていた(2026-09-23 の実機で、月1 の「生理生態学」(3Q)が
 * 「高分子化学Ⅱ」(4Q)に消された)。クォーターの科目には印(`quarter`)を付ける。
 *
 * 曜日・時限の無い科目(集中講義・未定)は表に置けないので `unscheduled` に分けて返す。
 * 表に置けないからといって捨てると、画面の科目と「今期登録単位」が合わなくなる。
 */
export function coursesToSlotTable(
  courses: {
    title: string;
    day: string | null;
    period: number | null;
    term: string | null;
    slots?: { term: string | null; day: string; period: number }[];
    category: string | null;
    syllabusCode: string | null;
    credits: number | null;
  }[],
): { table: SlotTable; unscheduled: SlotEntry[] } {
  const table: SlotTable = {};
  const unscheduled: SlotEntry[] = [];
  for (const course of courses) {
    const base = {
      name: course.title,
      type: categoryToCourseType(course.category),
      code: course.syllabusCode ?? undefined,
      credits: course.credits ?? undefined,
    };
    const slots =
      course.slots && course.slots.length > 0
        ? course.slots
        : course.day && course.period != null
          ? [{ term: course.term, day: course.day, period: course.period }]
          : [];
    if (slots.length === 0) {
      unscheduled.push({ ...base, quarter: quarterLabel([course.term]) });
      continue;
    }
    // 同じマスを2つの学期で占める科目(3Q 金3・4Q 金3)は1件にまとめる
    const terms = new Map<string, (string | null)[]>();
    for (const { term, day, period } of slots) {
      const key = `${period}:${day}`;
      terms.set(key, [...(terms.get(key) ?? []), term]);
    }
    for (const [key, cellTerms] of terms) {
      const [period, day] = key.split(":");
      const row = (table[Number(period)] ??= {});
      (row[day] ??= []).push({ ...base, quarter: quarterLabel(cellTerms) });
    }
  }
  // 1マスの中はクォーター順(学期いっぱいの科目を先に)
  const order = (e: SlotEntry) => (e.quarter ? QUARTERS.indexOf(e.quarter.slice(0, 2) as (typeof QUARTERS)[number]) + 1 : 0);
  for (const row of Object.values(table)) {
    for (const entries of Object.values(row)) entries.sort((a, b) => order(a) - order(b));
  }
  return { table, unscheduled };
}

/** 学期の前半のクォーター(上段)と後半のクォーター(下段) */
const FIRST_HALF = ["1Q", "3Q"];
const SECOND_HALF = ["2Q", "4Q"];

/** クォーターで分けたマス。空いている側は null */
export type QuarterLanes = {
  first: { quarter: string; entry: SlotEntry | null };
  second: { quarter: string; entry: SlotEntry | null };
};

/**
 * 1マスの科目を学期の前半(上段)と後半(下段)に振り分ける(ui-design_pc.pen /
 * ui-design_phone.pen 04 時間割)。**マスの上段＝3Q、下段＝4Q と位置を決めておく**ことで、
 * 3Q と 4Q の科目が「同じ時間に2つある」ようにも、4Q だけの科目が学期いっぱいある
 * ようにも見えなくなる。
 *
 * 分けられるのは、マスの科目がすべて1つのクォーターだけを占め、前半・後半に
 * 1科目ずつまでのときだけ。学期いっぱいの科目を含むマスや、同じクォーターに2科目
 * 入ったマス(提案の検証で弾かれるはずのコマ重複)は null を返し、縦に積む表示に任せる。
 */
export function quarterLanes(entries: SlotEntry[]): QuarterLanes | null {
  if (entries.length === 0 || entries.some((e) => !e.quarter || e.quarter.includes("・"))) return null;
  const first = entries.filter((e) => FIRST_HALF.includes(e.quarter!));
  const second = entries.filter((e) => SECOND_HALF.includes(e.quarter!));
  if (first.length > 1 || second.length > 1) return null;
  // 前期(1Q・2Q)か後期(3Q・4Q)か。空いている側の段の名前に使う
  const spring = entries.some((e) => e.quarter === "1Q" || e.quarter === "2Q");
  return {
    first: { quarter: spring ? "1Q" : "3Q", entry: first[0] ?? null },
    second: { quarter: spring ? "2Q" : "4Q", entry: second[0] ?? null },
  };
}
