"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CalendarCheck, CalendarPlus, X } from "lucide-react";
import {
  courseFromSyllabus,
  courseKey,
  useProposalStore,
  type SyllabusForTimetable,
} from "@/lib/proposal";
import { findConflicts, termFits } from "@/lib/timetable";
import { useTargetTerm } from "@/lib/targetTerm";
import { useTagMap } from "@/lib/useTagMap";
import type { CourseTarget } from "@/lib/eligibility";

/**
 * 「時間割に追加」（ui-design_pc.pen 06_講義詳細 ActionButton）。
 *
 * **学生はこの科目を自分で時間割に登録できる。** 押すと提案の store の `courses` に
 * 入り、時間割表・今期登録単位・卒業要件の見込みがそれに追従する（§8.3.5）。
 * AI の提案と同じ一覧に入り、`source: "student"` として時間割のアシスタントに渡る
 * （組み直しても外されない）。
 *
 * AI の提案と違い単位数上限などの検査は通らないため、**入れる前に手元で確かめる**:
 *  - 時間割の学期（`useTargetTerm()`）と開講学期が合うか
 *  - 同じ曜日・時限・クォーターに別の科目が入っていないか（`findConflicts()`）
 * どちらかに当たれば、それでも入れるかを聞く。
 *
 * 時間割の「別の科目に変更する」から来たとき（`replacing`）は、入れ替えのボタンになり、
 * 押すと元の科目と入れ替えて時間割へ戻る。すでに入っている科目では「外す」を出す。
 * 組み立ての途中とアシスタントの応答中は、届く時間割に上書きされるので押させない。
 */
export default function AddToTimetableButton({
  syllabus,
  target,
}: {
  syllabus: SyllabusForTimetable;
  target: CourseTarget;
}) {
  const router = useRouter();
  const { status, busy, courses, replacing, addCourse, removeCourse, replaceCourse, cancelReplace } =
    useProposalStore();
  const { target: term } = useTargetTerm();
  const tags = useTagMap()(syllabus.syllabus_code, target);

  const course = courseFromSyllabus(syllabus, tags);
  const key = courseKey(course);
  const inTimetable = courses.some((c) => courseKey(c) === key);

  /** 入れる前の確かめ。学生が「やめる」を選べば false */
  const confirmFits = (others: typeof courses) => {
    const warnings: string[] = [];
    if (!termFits(course.term, term.term)) {
      warnings.push(`この科目の開講学期（${course.term ?? "未定"}）は、時間割の学期（${term.term}）と異なります。`);
    }
    for (const c of findConflicts(course, others)) {
      warnings.push(`${c.day}曜${c.period}限に「${c.title}」が入っています。`);
    }
    if (warnings.length === 0) return true;
    return window.confirm(`${warnings.join("\n")}\nそれでも時間割に入れますか？`);
  };

  if (status === "loading" || busy) {
    return (
      <span className="flex shrink-0 items-center gap-2 rounded-lg border border-border-primary bg-surface-gray px-[18px] py-2.5">
        <CalendarPlus size={15} className="text-fg-tertiary" aria-hidden="true" />
        <span className="text-[13.5px] font-bold text-fg-tertiary">{status === "loading" ? "時間割を組んでいる間は追加できません" : "AIの応答中は追加できません"}</span>
      </span>
    );
  }

  if (replacing && replacing.key !== key && !inTimetable) {
    const handleReplace = () => {
      if (!confirmFits(courses.filter((c) => courseKey(c) !== replacing.key))) return;
      replaceCourse(replacing.key, course);
      router.push("/proposal");
    };
    return (
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleReplace}
          className="flex items-center gap-2 rounded-lg bg-accent px-[18px] py-2.5 transition-colors hover:bg-primary-dark"
        >
          <ArrowLeftRight size={15} className="text-fg-inverse" aria-hidden="true" />
          <span className="text-left text-[13.5px] font-bold text-fg-inverse">
            「{replacing.title}」をこの科目に変更
          </span>
        </button>
        <button
          type="button"
          onClick={cancelReplace}
          className="rounded-lg px-2.5 py-2.5 text-[12px] font-semibold text-fg-secondary transition-colors hover:bg-surface-gray"
        >
          変更をやめる
        </button>
      </span>
    );
  }

  if (inTimetable) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/proposal"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-primary bg-surface-gray px-[18px] py-2.5 transition-colors hover:bg-surface-soft"
        >
          <CalendarCheck size={15} className="text-fg-secondary" aria-hidden="true" />
          <span className="text-[13.5px] font-bold text-fg-secondary">時間割に入っています</span>
        </Link>
        <button
          type="button"
          onClick={() => removeCourse(key)}
          aria-label="時間割から外す"
          className="flex items-center gap-1 rounded-lg border border-border-primary px-3 py-2.5 text-[12px] font-semibold text-accent transition-colors hover:bg-accent-light"
        >
          <X size={14} aria-hidden="true" />
          外す
        </button>
      </span>
    );
  }

  const handleAdd = () => {
    if (!confirmFits(courses)) return;
    addCourse(course);
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-[18px] py-2.5 transition-colors hover:bg-primary-dark"
    >
      <CalendarPlus size={15} className="text-fg-inverse" aria-hidden="true" />
      <span className="text-[13.5px] font-bold text-fg-inverse">時間割に追加</span>
    </button>
  );
}
