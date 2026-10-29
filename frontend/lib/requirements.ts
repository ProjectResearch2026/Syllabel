import { useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/api_base";
import type { ProposedCourse } from "@/lib/chatApi";
import { normalizeTitle } from "@/lib/courseTitle";
import { programCodeOf, resolveAdmissionYear } from "@/lib/programs";
import type { Course, StudentProfile } from "@/lib/student";
import type { TargetTerm } from "@/lib/targetTerm";

/**
 * 卒業要件の充足状況(要件枠ごとの修得済み単位・不足単位)。design.md §4.4.5 / §6.1。
 *
 * 判定の規則(`accepts` の割り当て・溢れ・算入上限)はクライアントに持たず、
 * `POST /api/requirements` に任せる。既修得科目を本文で送るので POST であり、
 * backend は永続化もログ記録もしない(§4.2.3)。
 */

/** 要件枠1つ。`name` は公式の区分名(§5.1.2) */
export type SlotStatus = {
  key: string;
  name: string;
  required: number;
  earned: number;
  shortfall: number;
  notes: string | null;
  courses: { title: string; credits: number }[];
};

/**
 * 卒業要件に数えなかった理由。backend の `UncountedReason` と同じ値を並べる
 * (`app/curricula/requirements.py`)
 */
export type UncountedReason =
  | "not_in_curriculum"
  | "excluded_type"
  | "duplicate"
  | "over_credit_cap"
  | "no_matching_slot"
  | "no_slot_capacity";

/** 卒業要件に数えなかった科目(またはその一部)。`title` は送った科目名のまま返る */
export type UncountedCourse = { title: string; credits: number; reason: UncountedReason };

/**
 * 数えなかった理由の表示名(マイデータ。design.md §8.4.1)。
 * `not_in_curriculum` は**成績表の科目名と履修要項の科目名が一致しなかった**ことを言う。
 * 履修要項に無い科目のほか、表記の違いもここに落ちる
 */
export const UNCOUNTED_REASON_LABEL: Record<UncountedReason, string> = {
  not_in_curriculum: "履修要項の科目一覧に、同じ名前の科目がありません",
  excluded_type: "随意科目は卒業要件に含まれません",
  duplicate: "同じ名前の科目をすでに数えています",
  over_credit_cap: "卒業要件に数えられる単位の上限を超えた分です",
  no_matching_slot: "当てはまる卒業要件の枠がありません",
  no_slot_capacity: "当てはまる枠がすでに埋まっています（余剰）",
};

/**
 * 履修要項と**突き合わせられなかった**ことを表す理由。余剰・算入上限・重複・随意は履修要項の
 * 規定どおり数えていないだけだが、突き合わせられなかった科目は、成績表では数えられている
 * 単位を落としているおそれがある(科目名の表記の違い、履修要項データに無い科目)。卒業要件の
 * 帯で知らせるのはこちらだけにする — 余剰まで知らせると、4回生のほとんどに出て見分けが付かない
 */
export function isUnmatched(reason: UncountedReason): boolean {
  return reason === "not_in_curriculum" || reason === "no_matching_slot";
}

export type RequirementsResult = {
  totalCredits: number;
  earnedCredits: number;
  remainingCredits: number;
  satisfied: boolean;
  slots: SlotStatus[];
  uncounted: UncountedCourse[];
};

/** `POST /api/requirements`。`profile.program` は課程**コード**で送る(§6.1) */
export async function fetchRequirements(
  profile: StudentProfile,
  programCode: string,
  admissionYear: number,
  signal?: AbortSignal,
): Promise<RequirementsResult> {
  const res = await fetch(`${apiBase()}/requirements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { ...profile, program: programCode }, admissionYear }),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`requirements: ${res.status}`);
  return res.json();
}

/**
 * 枠の名前を帯に収まる長さに詰める。公式の区分名(`slot.name`)は「教養教育科目(必修・仏教)」の
 * ように**区別に要る部分が括弧の中にある**ため、末尾を「…」で切ると「教養教育科目(必修…」と
 * なり、どの枠か分からなくなっていた。共通の頭(「科目」「教養教育」)を削り、括弧の中を残す。
 * 公式の区分名はツールチップと読み上げで出す。
 * 卒業要件の帯(`RequirementsPanel.tsx`)とマイデータの科目の行き先で使う
 */
export function shortSlotName(name: string): string {
  return name
    .replace(/^教養教育科目/, "教養")
    .replace(/^(専門基礎|専門応用|専門関連)科目/, "$1")
    .replace("選択必修〈基幹〉・", "基幹・");
}

/** 修得済みの科目1件の単位の行き先。枠からあふれた単位は複数の枠に分かれることがある */
export type CourseDestination =
  | { kind: "slot"; key: string; name: string; credits: number }
  | { kind: "uncounted"; reason: UncountedReason; credits: number };

/** 科目ごとに返る理由(1行に1つ)。ほかの理由は、科目の単位を枠に割り当てた結果として返る */
const ROW_REASONS: ReadonlySet<UncountedReason> = new Set([
  "not_in_curriculum",
  "excluded_type",
  "duplicate",
]);

/**
 * 修得済みの科目ごとに、判定がその単位をどこに数えたかを返す(マイデータ。design.md §8.4.1)。
 *
 * **判定の結果を科目名で引き戻すだけで、手元で判定し直さない。** backend は合格した科目を
 * 送った順に見て、履修要項に無い・随意の科目はその行ごとに数えず、同じ名前の2行目以降は
 * `duplicate` にする(`app/curricula/requirements.py` の `_collect()`)。したがって同じ名前の
 * 科目は、最初の1行が枠への割り当て(と上限・余剰で数えなかった分)を受け取り、
 * 残りの行が `duplicate` を1つずつ受け取る。`courses` は判定に送った順のまま渡すこと
 */
export function courseDestinations(
  courses: Course[],
  counted: SlotStatus[],
  uncounted: UncountedCourse[],
): Map<Course, CourseDestination[]> {
  const push = <T,>(map: Map<string, T[]>, key: string, value: T) =>
    map.set(key, [...(map.get(key) ?? []), value]);

  const assigned = new Map<string, CourseDestination[]>();
  for (const slot of counted) {
    for (const c of slot.courses) {
      push(assigned, normalizeTitle(c.title), {
        kind: "slot",
        key: slot.key,
        name: slot.name,
        credits: c.credits,
      });
    }
  }
  const perRow = new Map<string, UncountedCourse[]>();
  for (const u of uncounted) {
    const dest: CourseDestination = { kind: "uncounted", reason: u.reason, credits: u.credits };
    if (ROW_REASONS.has(u.reason)) push(perRow, normalizeTitle(u.title), u);
    else push(assigned, normalizeTitle(u.title), dest);
  }

  const result = new Map<Course, CourseDestination[]>();
  for (const course of courses) {
    if (course.status !== "passed") continue;
    const title = normalizeTitle(course.title);
    const parts = assigned.get(title);
    if (parts) {
      result.set(course, parts);
      assigned.delete(title);
      continue;
    }
    const row = perRow.get(title)?.shift();
    result.set(course, row ? [{ kind: "uncounted", reason: row.reason, credits: row.credits }] : []);
  }
  return result;
}

/** 画面に出す要件枠1つ。`planned` は今期の時間割(提案の科目)を修得したときに増える単位 */
export type SlotProgress = {
  key: string;
  name: string;
  required: number;
  earned: number;
  planned: number;
  /**
   * 成績発表待ち(`registered`)の科目に合格したときに増える単位。修得済みでも今期の
   * 時間割でもないので、どちらとも別の色で出す(`shortfall` には含めない)
   */
  pending: number;
  /** 今期の時間割をすべて修得したあとの不足単位 */
  shortfall: number;
  /**
   * 修得済みだけで見た不足単位。枠を「取得済み」とバーに振り分けるのはこちらで行う —
   * 見込みの `shortfall` で振り分けると、時間割が変わるたびにバーの本数が増減し、
   * 今期で埋まるだけの枠まで「取得済み」に入ってしまう
   */
  earnedShortfall: number;
  notes: string | null;
};

export type RequirementsView =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      slots: SlotProgress[];
      totalCredits: number;
      earnedCredits: number;
      /** 今期の時間割で卒業要件に算入される単位(上限や溢れで数えられない分は入らない) */
      plannedCredits: number;
      /** 成績発表待ちの科目に合格したときに卒業要件に算入される単位 */
      pendingCredits: number;
      /** 今期の時間割をすべて修得したあとの卒業残り単位 */
      remainingCredits: number;
      /** 見込みの計算が最新の時間割に追いついていない(提案の生成中・再計算中) */
      updating: boolean;
      /**
       * 修得済みの科目の行き先(どの枠に何単位数えたか、数えなかった分と理由)。
       * `required: 0` の枠も含む判定のままの全枠で、マイデータが科目ごとに出す(§8.4.1)
       */
      counted: SlotStatus[];
      /** 修得済みのうち卒業要件に数えなかった科目。今期の時間割・成績発表待ちは含めない */
      uncounted: UncountedCourse[];
    };

/**
 * 今期の時間割(提案の科目)を「修得した」とみなす形にする。単位が分からない科目は数えない。
 *
 * **登録済みで成績が未確定の科目(`registered`)は入れない。** 成績表は学期の成績が
 * 確定してから公開される(3月中旬・9月初旬)ので、そこに `***` で載るのは**終わった学期の
 * 成績発表待ちの科目**であり、提案する学期の時間割ではない。入れると、提案していないのに
 * その単位が「今期で埋まる分」として赤く積まれ、卒業残りからも引かれていた。
 */
function plannedCourses(courses: ProposedCourse[], target: TargetTerm): Course[] {
  return courses
    .filter((c) => c.credits != null)
    .map((c) => ({
      title: c.title,
      year: target.year,
      term: target.term,
      credits: c.credits as number,
      status: "passed",
    }));
}

/** 提案の snapshot は生成中に何度も届くので、落ち着いてから見込みを計算し直す */
const PLANNED_DEBOUNCE_MS = 300;

/**
 * 卒業要件枠ごとの修得済み単位と、今期の時間割による見込みを返す。design.md §8.3.5。
 *
 * `POST /api/requirements` を2回引く。1回目はプロファイルのまま(修得済み)、2回目は
 * 今期の時間割(提案の科目)を修得したとみなして足したもの(見込み)。
 * 枠ごとの差が「今期で埋まる単位」である。**枠への割り当ては backend の判定に任せる** —
 * 同じ枠の科目を不足より多く取った分は下流の枠(オールフリーゾーンなど)に回るため、
 * 科目の区分から手元で足し算すると枠が食い違う。
 *
 * 見込みは `courses`(提案の store)に追従する。提案の生成中は snapshot ごとに、
 * 提案が差し替わればそのたびに計算し直す。時間割を変える経路が増えても、
 * store の `courses` を書き換える限りここは変えずに追従する。
 */
export function useRequirements(
  profile: StudentProfile | null,
  courses: ProposedCourse[],
  target: TargetTerm,
): RequirementsView {
  const programCode = programCodeOf(profile?.program);
  const admissionYear = resolveAdmissionYear(profile);

  const planned = useMemo(
    () => (profile ? plannedCourses(courses, target) : []),
    [profile, courses, target],
  );
  // 同じ中身の時間割で計算し直さないよう、中身を文字列にして比べる
  const plannedKey = JSON.stringify(planned);

  const [base, setBase] = useState<{
    profile: StudentProfile;
    result: RequirementsResult;
    /** 成績発表待ちの科目に合格したとみなした判定。そうした科目が無ければ null */
    pending: RequirementsResult | null;
  } | null>(null);
  const [baseError, setBaseError] = useState<StudentProfile | null>(null);
  const [withPlan, setWithPlan] = useState<{ key: string; result: RequirementsResult } | null>(
    null,
  );

  // 修得済み(プロファイルのまま)と、成績発表待ちの科目に合格したとみなしたもの。
  // どちらもプロファイルが変わったときだけ引く
  useEffect(() => {
    if (!profile || !programCode || admissionYear == null) return;
    const ctrl = new AbortController();
    const hasPending = profile.completedCourses.some((c) => c.status === "registered");
    const withPending: StudentProfile = {
      ...profile,
      completedCourses: profile.completedCourses.map((c) =>
        c.status === "registered" ? { ...c, status: "passed" } : c,
      ),
    };
    Promise.all([
      fetchRequirements(profile, programCode, admissionYear, ctrl.signal),
      hasPending ? fetchRequirements(withPending, programCode, admissionYear, ctrl.signal) : null,
    ])
      .then(([result, pending]) => setBase({ profile, result, pending }))
      .catch((err) => {
        if ((err as Error).name !== "AbortError") setBaseError(profile);
      });
    return () => ctrl.abort();
  }, [profile, programCode, admissionYear]);

  // 見込み(今期の時間割を足す)。時間割が変わるたびに、落ち着いてから引く
  useEffect(() => {
    if (!profile || !programCode || admissionYear == null || planned.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      const withCourses = { ...profile, completedCourses: [...profile.completedCourses, ...planned] };
      fetchRequirements(withCourses, programCode, admissionYear, ctrl.signal)
        .then((result) => setWithPlan({ key: plannedKey, result }))
        .catch(() => {
          // 見込みが引けなくても修得済みは出す(前回の見込みは古いので使わない)
        });
    }, PLANNED_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `planned` の中身は `plannedKey` が表す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, programCode, admissionYear, plannedKey]);

  if (!profile || !programCode || admissionYear == null) return { status: "unavailable" };
  if (base?.profile !== profile) return baseError === profile ? { status: "error" } : { status: "loading" };

  const before = base.result;
  // 時間割が空なら見込みは修得済みと同じ。最新の時間割の見込みが無ければ直前のものを
  // 使わず、修得済みだけを出して「更新中」とする
  const after = planned.length === 0 ? before : withPlan?.key === plannedKey ? withPlan.result : null;
  const afterSlots = new Map((after ?? before).slots.map((s) => [s.key, s]));
  const pendingSlots = new Map((base.pending ?? before).slots.map((s) => [s.key, s]));

  const slots = before.slots
    // `required: 0` の枠は受け皿を持たない通過点(§4.4.5)。画面には出さない
    .filter((s) => s.required > 0)
    // フリーゾーンは専攻科目・教養教育科目から溢れた単位の受け皿なので最後に並べる。
    // 判定の並び(課程ファイル→教養教育科目ファイル)のままだと専攻と教養の間に挟まる
    .sort((a, b) => Number(a.key.startsWith("free.")) - Number(b.key.startsWith("free.")))
    .map((s) => {
      const next = afterSlots.get(s.key) ?? s;
      return {
        key: s.key,
        name: s.name,
        required: s.required,
        earned: s.earned,
        planned: Math.max(0, next.earned - s.earned),
        pending: Math.max(0, (pendingSlots.get(s.key)?.earned ?? s.earned) - s.earned),
        shortfall: next.shortfall,
        earnedShortfall: s.shortfall,
        notes: s.notes,
      };
    });

  return {
    status: "ready",
    slots,
    totalCredits: before.totalCredits,
    earnedCredits: before.earnedCredits,
    plannedCredits: Math.max(0, (after ?? before).earnedCredits - before.earnedCredits),
    pendingCredits: Math.max(0, (base.pending ?? before).earnedCredits - before.earnedCredits),
    remainingCredits: (after ?? before).remainingCredits,
    updating: after === null,
    counted: before.slots,
    uncounted: before.uncounted,
  };
}
