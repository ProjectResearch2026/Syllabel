"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Search, Trash2 } from "lucide-react";
import {
  COURSE_STATUS_LABEL,
  type StudentProfile,
  type Course,
  type CourseTerm,
} from "@/lib/student";
// 課程の正本は `curricula/admission-<年度>/` の課程ファイル（design.md §4.4.2）。
// 履修要項を引けない課程名を選ばせないため、一覧はそこから引く
import {
  PROGRAM_NAMES as PROGRAMS,
  getAdmissionYear,
  programCodeOf,
  resolveAdmissionYear,
} from "@/lib/programs";
import { fetchCurricula, type CurriculaCourse } from "@/lib/syllabus-api";
import { CATEGORY_LABEL } from "@/lib/courseLabels";
import { normalizeTitle } from "@/lib/courseTitle";
import { matchesTitle } from "@/lib/titleSearch";

const TERMS: CourseTerm[] = ["前期", "後期", "通年", "1Q", "2Q", "3Q", "4Q", "サ集"];
const STATUSES: Course["status"][] = ["passed", "failed", "withdrawn", "registered"];
/** 候補は語を足して絞らせる。全件（数百科目）を並べない */
const MAX_RESULTS = 30;

/** 履修要項の取得結果。課程・入学年度を選び直したら前の結果は使わないよう key を持つ */
type Candidates =
  | { key: string; status: "ok"; courses: CurriculaCourse[] }
  | { key: string; status: "error" };

/** 足す科目の、学生が選ぶ部分。科目名と単位数は履修要項の値で固定する */
type Addition = { course: CurriculaCourse; year: number; term: CourseTerm; status: Course["status"] };

interface Props {
  profile: StudentProfile;
  /** 内容が変わり、学生が確認したときだけ呼ぶ。何も変わっていなければ `onCancel` を呼ぶ */
  onSave: (profile: StudentProfile) => void;
  onCancel: () => void;
}

/**
 * マイデータの訂正（design.md §8.4、要件§4.1）。PC・モバイル共通。
 *
 * - **科目の追加は履修要項（`GET /api/curricula`）の科目から選ぶ。** 科目名を自由に入力させると、
 *   履修要項に無い科目名は卒業要件の判定で突き合わせられず、計上されない科目になる
 * - 制限はそれだけにする。成績表から取り込んだ科目の削除・履修状態の変更、学年・課程の訂正は
 *   止めない（パーサーの読み取りの誤りを直す手段）
 * - **保存はフォームが触らない項目（`issuedOn` / `enrollment` / `demo`）を保つ。** 作り直すと
 *   提案する学期が今日の日付からの推定に変わり、デモの学生は選んだ学期の固定が外れる
 */
export default function ProfileEditForm({ profile, onSave, onCancel }: Props) {
  const [grade, setGrade] = useState<1 | 2 | 3 | 4 | null>(profile.grade);
  const [program, setProgram] = useState(profile.program ?? "");
  const [courses, setCourses] = useState<Course[]>(profile.completedCourses);
  const [errors, setErrors] = useState<{ grade?: boolean; program?: boolean }>({});
  const [adding, setAdding] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [pick, setPick] = useState<Addition | null>(null);

  // 成績表から読んだ入学年度は、学年を変えない限り引き継ぐ。変えたら今日を基準に推定し直す
  const admissionYear =
    grade === profile.grade ? profile.admissionYear : grade !== null ? getAdmissionYear(grade) : null;
  const curriculaYear = resolveAdmissionYear({ grade, admissionYear });
  const programCode = programCodeOf(program);
  const key = programCode && curriculaYear ? `${programCode}/${curriculaYear}` : null;

  // 候補は課程・入学年度の単位で丸ごと引き、絞り込みは手元で行う（学生の科目一覧は送らない）
  const [loaded, setLoaded] = useState<Candidates | null>(null);
  useEffect(() => {
    if (!key || !programCode || !curriculaYear) return;
    let cancelled = false;
    fetchCurricula(programCode, curriculaYear)
      .then((data) => {
        if (!cancelled) setLoaded({ key, status: "ok", courses: data.courses });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, programCode, curriculaYear]);
  const candidates = loaded && loaded.key === key ? loaded : null;

  // 同じ科目を2件にしない。一覧にある科目は候補から外し、結果が変わったら行の履修状態を変えさせる。
  // backend は自課程の設置科目を先に返すので、同名は先に現れたものを採る
  const options = useMemo(() => {
    if (candidates?.status !== "ok") return [];
    const taken = new Set(courses.map((c) => normalizeTitle(c.title)));
    const seen = new Set<string>();
    return candidates.courses.filter((c) => {
      const k = normalizeTitle(c.title);
      if (taken.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [candidates, courses]);
  const matches = keyword.trim() ? options.filter((c) => matchesTitle(c.title, keyword)) : [];

  // 年度は入学年度から今年度まで
  const currentYear = getAdmissionYear(1);
  const firstYear = Math.min(curriculaYear ?? currentYear, currentYear);
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i);

  // 成績表から取り込んだ一覧には不合格・履修辞退も並ぶ。単位に数えるのは合格したものだけ(要件§4.2)
  const totalCredits = courses
    .filter((c) => c.status === "passed")
    .reduce((s, c) => s + c.credits, 0);

  const choose = (course: CurriculaCourse) => {
    // 初期値は履修要項の配当年次・学期。開講時期が年度で変わった科目もあるので選び直せる
    const year = Math.min(Math.max(firstYear + course.grade - 1, firstYear), currentYear);
    const term: CourseTerm = course.quarters?.length === 1 ? course.quarters[0] : course.term;
    setPick({ course, year, term, status: "passed" });
  };

  const closeAdding = () => {
    setAdding(false);
    setKeyword("");
    setPick(null);
  };

  const handleAdd = () => {
    if (!pick) return;
    setCourses((prev) => [
      ...prev,
      {
        title: pick.course.title,
        year: pick.year,
        term: pick.term,
        credits: pick.course.credits,
        status: pick.status,
      },
    ]);
    closeAdding();
  };

  const setStatus = (index: number, status: Course["status"]) =>
    setCourses((prev) => prev.map((c, i) => (i === index ? { ...c, status } : c)));
  const removeCourse = (index: number) => setCourses((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = () => {
    const e: typeof errors = {};
    if (!grade) e.grade = true;
    if (!program) e.program = true;
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    const changed =
      grade !== profile.grade ||
      program !== profile.program ||
      JSON.stringify(courses) !== JSON.stringify(profile.completedCourses);
    if (!changed) {
      onCancel();
      return;
    }
    // 学年・課程が変われば提案の前提が、科目が変われば修得済み・再履修の判断が変わる。
    // 場合分けせず、変わったら提案と会話を捨てる（design.md §8.4）
    if (!confirm("保存すると、これまでの履修提案とAIとの会話はリセットされます。保存しますか?")) return;
    onSave({ ...profile, grade, program, admissionYear, completedCourses: courses });
  };

  return (
    <div className="flex flex-col bg-white min-h-full">
      {/* PC（マイデータ）では固定表示のヘッダー（68px）の下に止める */}
      <header className="sticky top-0 md:top-[68px] z-20 flex items-center gap-3 px-5 h-14 bg-white border-b border-[#D1D5DB]">
        <button onClick={onCancel} aria-label="戻る" className="-ml-1.5">
          <ChevronLeft size={22} className="text-[#1A2B4E]" />
        </button>
        <span className="text-[#1A2B4E] text-lg font-bold">学生情報を訂正</span>
      </header>

      <div className="flex flex-col overflow-y-auto">
        {/* 学年 */}
        <section className="px-5 pt-5 pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">学年</h2>
            {errors.grade && <span className="text-[11px] text-[#DC2626]">選択してください</span>}
          </div>
          <div className="flex gap-2">
            {([1, 2, 3, 4] as const).map((g) => (
              <button
                key={g}
                onClick={() => { setGrade(g); setErrors((e) => ({ ...e, grade: false })); }}
                className={`flex-1 h-11 rounded-lg border-2 text-sm font-bold transition-colors ${
                  grade === g
                    ? "border-[#1A2B4E] bg-[#1A2B4E] text-white"
                    : errors.grade
                    ? "border-[#DC2626] text-[#DC2626]"
                    : "border-[#D1D5DB] text-[#4B5563] active:bg-[#F3F4F6]"
                }`}
              >
                {g}回生
              </button>
            ))}
          </div>
        </section>

        {/* 課程 */}
        <section className="px-5 pt-4 pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">課程</h2>
            {errors.program && <span className="text-[11px] text-[#DC2626]">選択してください</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            {PROGRAMS.map((p) => (
              <button
                key={p}
                onClick={() => { setProgram(p); setErrors((e) => ({ ...e, program: false })); }}
                className={`w-full h-11 px-4 rounded-lg border-2 text-sm font-semibold text-left transition-colors ${
                  program === p
                    ? "border-[#1A2B4E] bg-[#EEF0F5] text-[#1A2B4E]"
                    : errors.program
                    ? "border-[#DC2626] text-[#DC2626]"
                    : "border-[#E5E7EB] text-[#4B5563] active:bg-[#F8F9FA]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {/* 科目一覧。成績表から取り込んだ未修得・登録済みの科目も並ぶ */}
        <section className="px-5 pt-4 pb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-bold text-[#1A2B4E]">
              科目
              <span className="ml-2 text-[11px] font-normal text-[#9CA3AF]">
                {courses.length}科目 · 修得{totalCredits}単位
              </span>
            </h2>
          </div>

          {courses.length > 0 && (
            <div className="mb-3 rounded-lg border border-[#E5E7EB] overflow-hidden">
              {courses.map((c, i) => (
                <div
                  key={`${c.title}-${c.year}-${c.term}-${i}`}
                  className={`flex items-center gap-2.5 h-12 px-3.5 border-b border-[#F3F4F6] last:border-b-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-[#F8F9FA]"
                  }`}
                >
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-semibold text-[#1A2B4E] truncate">{c.title}</span>
                    <span className="text-[10px] text-[#9CA3AF]">
                      {c.year} {c.term} · {c.credits}単位
                    </span>
                  </div>
                  {/* 結果が変わったときは科目を足し直さず、ここで履修状態を変える */}
                  <select
                    value={c.status}
                    onChange={(e) => setStatus(i, e.target.value as Course["status"])}
                    aria-label={`${c.title}の履修状態`}
                    className={`shrink-0 h-8 rounded-md border px-1.5 text-[11px] font-bold focus:outline-none focus:border-[#1A2B4E] ${
                      c.status === "failed" || c.status === "withdrawn"
                        ? "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]"
                        : c.status === "registered"
                        ? "border-[#D1D5DB] bg-pending-bg text-pending-fg"
                        : "border-[#D1D5DB] bg-white text-[#1A2B4E]"
                    }`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{COURSE_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeCourse(i)}
                    aria-label={`${c.title}を削除`}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-md active:bg-[#FEE2E2] transition-colors"
                  >
                    <Trash2 size={15} className="text-[#EF4444]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="rounded-lg border-2 border-[#1A2B4E] bg-[#F8F9FA] p-4 flex flex-col gap-3">
              <h3 className="text-[13px] font-bold text-[#1A2B4E]">科目を追加</h3>

              {pick ? (
                <>
                  <div className="flex flex-col gap-0.5 rounded-lg border border-[#D1D5DB] bg-white px-3 py-2.5">
                    <span className="text-[13px] font-semibold text-[#1A2B4E]">{pick.course.title}</span>
                    <span className="text-[11px] text-[#6B7280]">
                      {CATEGORY_LABEL[pick.course.category]} · {pick.course.credits}単位
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex flex-col gap-1 flex-1">
                      <label htmlFor="add-year" className="text-[11px] font-semibold text-[#6B7280]">年度</label>
                      <select
                        id="add-year"
                        value={pick.year}
                        onChange={(e) => setPick({ ...pick, year: Number(e.target.value) })}
                        className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                      >
                        {years.map((y) => (
                          <option key={y} value={y}>{y}年度</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label htmlFor="add-term" className="text-[11px] font-semibold text-[#6B7280]">学期</label>
                      <select
                        id="add-term"
                        value={pick.term}
                        onChange={(e) => setPick({ ...pick, term: e.target.value as CourseTerm })}
                        className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                      >
                        {TERMS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label htmlFor="add-status" className="text-[11px] font-semibold text-[#6B7280]">履修状態</label>
                      <select
                        id="add-status"
                        value={pick.status}
                        onChange={(e) => setPick({ ...pick, status: e.target.value as Course["status"] })}
                        className="h-10 px-2 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] focus:outline-none focus:border-[#1A2B4E]"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{COURSE_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setPick(null)}
                      className="flex-1 h-9 rounded-lg border border-[#D1D5DB] text-sm text-[#4B5563] active:bg-[#F3F4F6] transition-colors"
                    >
                      選び直す
                    </button>
                    <button
                      onClick={handleAdd}
                      className="flex-1 h-9 rounded-lg bg-[#1A2B4E] text-sm font-semibold text-white active:bg-[#111e35] transition-colors"
                    >
                      追加する
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {!key ? (
                    <p className="text-xs text-[#6B7280]">学年と課程を選ぶと、履修要項の科目から選べます。</p>
                  ) : candidates === null ? (
                    <p className="text-xs text-[#6B7280]">履修要項を読み込んでいます…</p>
                  ) : candidates.status === "error" ? (
                    // 候補が引けなくても、ほかの訂正と保存は続けられる
                    <p className="text-xs text-[#991B1B]">
                      履修要項を読み込めなかったため、いまは科目を追加できません。ほかの訂正と保存はできます。
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <Search
                          size={15}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          placeholder="科目名で探す（例: 線形代数）"
                          aria-label="履修要項の科目名で探す"
                          className="w-full h-10 pl-9 pr-3 rounded-lg border border-[#D1D5DB] bg-white text-sm text-[#1A2B4E] placeholder:text-[#D1D5DB] focus:outline-none focus:border-[#1A2B4E]"
                        />
                      </div>
                      <p className="text-[11px] text-[#6B7280]">
                        {curriculaYear}年度入学の履修要項に載っている科目から選びます。一覧にある科目は出しません。
                      </p>
                      {keyword.trim() && (
                        matches.length === 0 ? (
                          <p className="text-xs text-[#6B7280]">当てはまる科目がありません。</p>
                        ) : (
                          <ul className="flex flex-col rounded-lg border border-[#E5E7EB] bg-white overflow-hidden">
                            {matches.slice(0, MAX_RESULTS).map((c) => (
                              <li key={`${c.title}-${c.own ? "own" : "related"}`} className="border-b border-[#F3F4F6] last:border-b-0">
                                <button
                                  onClick={() => choose(c)}
                                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-[#F3F4F6] hover:bg-[#F8F9FA] transition-colors"
                                >
                                  <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-[#1A2B4E]">{c.title}</span>
                                  <span className="shrink-0 text-[11px] text-[#6B7280]">
                                    {CATEGORY_LABEL[c.category]} · {c.credits}単位
                                  </span>
                                </button>
                              </li>
                            ))}
                            {matches.length > MAX_RESULTS && (
                              <li className="px-3 py-2 text-[11px] text-[#6B7280]">
                                ほか{matches.length - MAX_RESULTS}件。語を足して絞り込んでください。
                              </li>
                            )}
                          </ul>
                        )
                      )}
                    </>
                  )}
                  <button
                    onClick={closeAdding}
                    className="h-9 rounded-lg border border-[#D1D5DB] text-sm text-[#4B5563] active:bg-[#F3F4F6] transition-colors"
                  >
                    キャンセル
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full h-11 rounded-lg border-2 border-dashed border-[#D1D5DB] flex items-center justify-center gap-2 active:border-[#1A2B4E] active:bg-[#F8F9FA] transition-colors"
            >
              <Plus size={16} className="text-[#6B7280]" />
              <span className="text-sm text-[#6B7280]">科目を追加</span>
            </button>
          )}
        </section>

        {/* Submit */}
        <div className="px-5 pb-10 flex flex-col gap-2 border-t border-[#E5E7EB] pt-4">
          <button
            onClick={handleSubmit}
            className="w-full h-[52px] rounded-lg bg-[#E60012] flex items-center justify-center active:bg-[#b7000c] transition-colors"
          >
            <span className="text-[15px] font-bold text-white">保存する</span>
          </button>
          <button
            onClick={onCancel}
            className="w-full h-11 rounded-lg border border-[#D1D5DB] flex items-center justify-center active:bg-[#F8F9FA] transition-colors"
          >
            <span className="text-sm text-[#4B5563]">キャンセル</span>
          </button>
        </div>
      </div>
    </div>
  );
}
