import { useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/api_base";
import type { ProposedCourse } from "@/lib/chatApi";
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

export type RequirementsResult = {
  totalCredits: number;
  earnedCredits: number;
  remainingCredits: number;
  satisfied: boolean;
  slots: SlotStatus[];
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

/** 画面に出す要件枠1つ。`planned` は今期の時間割(提案・登録済み)を修得したときに増える単位 */
export type SlotProgress = {
  key: string;
  name: string;
  required: number;
  earned: number;
  planned: number;
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
      /** 今期の時間割をすべて修得したあとの卒業残り単位 */
      remainingCredits: number;
      /** 見込みの計算が最新の時間割に追いついていない(提案の生成中・再計算中) */
      updating: boolean;
    };

/**
 * 今期の時間割の科目を「修得した」とみなす形にする。提案の科目と、登録済みで
 * 成績が未確定の科目(`registered`)の両方である。単位が分からない科目は数えない。
 */
function plannedCourses(profile: StudentProfile, courses: ProposedCourse[], target: TargetTerm): Course[] {
  const proposed: Course[] = courses
    .filter((c) => c.credits != null)
    .map((c) => ({
      title: c.title,
      year: target.year,
      term: target.term,
      credits: c.credits as number,
      status: "passed",
    }));
  const registered: Course[] = profile.completedCourses
    .filter((c) => c.status === "registered")
    .map((c) => ({ ...c, status: "passed" }));
  return [...proposed, ...registered];
}

/** 提案の snapshot は生成中に何度も届くので、落ち着いてから見込みを計算し直す */
const PLANNED_DEBOUNCE_MS = 300;

/**
 * 卒業要件枠ごとの修得済み単位と、今期の時間割による見込みを返す。design.md §8.3.5。
 *
 * `POST /api/requirements` を2回引く。1回目はプロファイルのまま(修得済み)、2回目は
 * 今期の時間割(提案の科目・登録済みの科目)を修得したとみなして足したもの(見込み)。
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
    () => (profile ? plannedCourses(profile, courses, target) : []),
    [profile, courses, target],
  );
  // 同じ中身の時間割で計算し直さないよう、中身を文字列にして比べる
  const plannedKey = JSON.stringify(planned);

  const [base, setBase] = useState<{ profile: StudentProfile; result: RequirementsResult } | null>(
    null,
  );
  const [baseError, setBaseError] = useState<StudentProfile | null>(null);
  const [withPlan, setWithPlan] = useState<{ key: string; result: RequirementsResult } | null>(
    null,
  );

  // 修得済み(プロファイルのまま)。プロファイルが変わったときだけ引く
  useEffect(() => {
    if (!profile || !programCode || admissionYear == null) return;
    const ctrl = new AbortController();
    fetchRequirements(profile, programCode, admissionYear, ctrl.signal)
      .then((result) => setBase({ profile, result }))
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

  const slots = before.slots
    // `required: 0` の枠は受け皿を持たない通過点(§4.4.5)。画面には出さない
    .filter((s) => s.required > 0)
    .map((s) => {
      const next = afterSlots.get(s.key) ?? s;
      return {
        key: s.key,
        name: s.name,
        required: s.required,
        earned: s.earned,
        planned: Math.max(0, next.earned - s.earned),
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
    remainingCredits: (after ?? before).remainingCredits,
    updating: after === null,
  };
}
