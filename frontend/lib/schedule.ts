/**
 * 開講時期・曜日時限の表示。design.md §6.2。
 *
 * **`day_of_week` / `period` だけでは開講の実態を表せない。** api-clean の両列は
 * 1コマ分しか持たず、複数コマの科目(`火４・火５`)では2コマ目が落ち、集中講義では
 * どちらも null になる(`通年　集中` が 1,887 件中 263 件)。
 * 生値の `term_schedule_raw` には開講期とコマがそのまま入っているので、
 * **表示はこちらを整形して使い**、欠けているときだけ列の値へ落とす。
 */

/** 全角の英数字と空白を半角に寄せる。カタカナ・記号は意味が変わり得るので触らない */
function toHalfWidth(value: string): string {
  return value
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/** `月３` → `月3限`。曜日と数字の並びだけを対象にする */
function withPeriodSuffix(token: string): string {
  return token.replace(/([月火水木金土日])(\d+)/g, "$1$2限");
}

/**
 * 開講の表示文字列を作る。`３Ｑ　金２、４Ｑ　金２` のように期が分かれる科目が
 * あるため、`、` 区切りは分けて返す。
 *
 * @returns 例 `["後期 水2限"]` / `["2Q 火4限・火5限"]` / `["通年 集中"]`
 */
export function formatSchedule(syllabus: {
  term_schedule_raw?: string | null;
  term_name?: string | null;
  day_of_week?: string | null;
  period?: number | null;
}): string[] {
  const raw = syllabus.term_schedule_raw?.trim();
  if (raw) {
    return toHalfWidth(raw)
      .split("、")
      .map((part) => withPeriodSuffix(part.trim().replace(/\s+/g, " ")))
      .filter((part) => part !== "");
  }

  // 生値が無い行への保険。列の値から組み立てる
  const term = syllabus.term_name?.trim();
  const slot =
    syllabus.day_of_week && syllabus.period != null
      ? `${syllabus.day_of_week}${syllabus.period}限`
      : null;
  const fallback = [term, slot].filter(Boolean).join(" ");
  return fallback ? [fallback] : [];
}

/**
 * 一覧の曜日時限の表示。一覧は生値を持たないので、開講コマの一覧 `slots`
 * (api-clean 0.3.0 以降)から作る。無ければ1コマ目の `day_of_week` / `period`。
 *
 * @param weekday 曜日に「曜」を添えるか(`金曜4・5限` / `金4・5限`)
 * @returns 例 `金4・5限` / `月1限・木4限`。コマが無ければ `未定`
 */
export function formatSlots(
  syllabus: {
    day_of_week?: string | null;
    period?: number | null;
    slots?: { day: string; period: number }[];
  },
  { weekday = false }: { weekday?: boolean } = {},
): string {
  const slots =
    syllabus.slots && syllabus.slots.length > 0
      ? syllabus.slots
      : syllabus.day_of_week && syllabus.period != null
        ? [{ day: syllabus.day_of_week, period: syllabus.period }]
        : [];
  if (slots.length === 0) return "未定";
  const suffix = weekday ? "曜" : "";
  const days = [...new Set(slots.map((s) => s.day))];
  if (days.length === 1) {
    // 学期違いで同じコマ(3Q 金3・4Q 金3)は時限が重なるので1つにまとめる
    const periods = [...new Set(slots.map((s) => s.period))];
    return `${days[0]}${suffix}${periods.join("・")}限`;
  }
  return slots.map((s) => `${s.day}${suffix}${s.period}限`).join("・");
}

/** `1年次～4年次` のような生値を `1〜4年次` に詰める。無ければ min/max から作る */
export function formatGrade(syllabus: {
  grade_raw?: string | null;
  grade_min?: number | null;
  grade_max?: number | null;
}): string | null {
  const raw = syllabus.grade_raw?.trim();
  if (raw) {
    const range = raw.match(/^(\d)年次\s*[～~−\-]\s*(\d)年次$/);
    if (range) {
      return range[1] === range[2] ? `${range[1]}年次` : `${range[1]}〜${range[2]}年次`;
    }
    return raw;
  }
  const { grade_min: min, grade_max: max } = syllabus;
  if (min == null || max == null) return null;
  return min === max ? `${min}年次` : `${min}〜${max}年次`;
}
