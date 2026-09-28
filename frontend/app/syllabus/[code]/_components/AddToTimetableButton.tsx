"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import type { CourseSlot, ProposedCourse } from "@/lib/chatApi";
import type { CourseTarget } from "@/lib/eligibility";
import { checkAddable, useProposalStore } from "@/lib/proposal";
import { useTargetTerm } from "@/lib/targetTerm";
import { useTagMap } from "@/lib/useTagMap";

/** 時間割に置くために要る、シラバスの項目 */
export type AddableCourse = {
  code: string;
  title: string;
  /** 開講学期(前期 / 後期 / 通年 / 1Q など) */
  term: string | null;
  day: string | null;
  period: number | null;
  slots?: { term: string | null; day: string; period: number }[];
  credits: number | null;
  target: CourseTarget;
};

/**
 * 「時間割に追加」（ui-design_pc.pen 06_講義詳細 ActionButton）。
 *
 * **押すとこの科目を提案の時間割に足し、時間割画面へ移る。** 以前は提案チャットへ
 * 「追加できますか?」という依頼を置いて移るだけだったが、その依頼は送信されず、
 * 送信しても提案チャットは文章で答えるだけで時間割を変えない（§7.3 規則7）ため、
 * 押しても何も起きなかった。
 *
 * 足す前に、提案の生成と同じくコマ重複と学期違いを検査する（`checkAddable()`）。
 * 通らないときは足さずに理由をボタンの下に示す。提案がまだ無いときは足す先が
 * 無いので、時間割画面で提案を作るよう案内する。
 *
 * **提案の時間割にすでに入っている科目では押させない。** 時間割の科目から詳細を
 * 開いたとき(design.md §8.3.4)に追加しても意味が無い。同じ科目の別クラス
 * (コードが違う)は入っていないものとして扱う。
 */
export default function AddToTimetableButton({ course }: { course: AddableCourse }) {
  const router = useRouter();
  const status = useProposalStore((s) => s.status);
  const courses = useProposalStore((s) => s.courses);
  const addCourse = useProposalStore((s) => s.addCourse);
  const { target } = useTargetTerm();
  const tags = useTagMap()(course.code, course.target);
  const [notice, setNotice] = useState<string | null>(null);

  const inProposal = status === "done" && courses.some((c) => c.syllabusCode === course.code);

  if (inProposal) {
    return (
      <span className="flex shrink-0 items-center gap-2 rounded-lg border border-border-primary bg-surface-gray px-[18px] py-2.5">
        <CalendarCheck size={15} className="text-fg-secondary" aria-hidden="true" />
        <span className="text-[13.5px] font-bold text-fg-secondary">提案の時間割に入っています</span>
      </span>
    );
  }

  const handleClick = () => {
    if (status === "loading") {
      setNotice("時間割の提案を作成中です。完成してから追加してください。");
      return;
    }
    if (status !== "done") {
      setNotice("まだ時間割がありません。先に時間割の画面で提案を作成してください。");
      return;
    }

    const proposed: ProposedCourse = {
      syllabusCode: course.code,
      title: course.title,
      day: (course.day || null) as ProposedCourse["day"],
      period: course.period || null,
      term: course.term,
      slots: (course.slots ?? []) as CourseSlot[],
      credits: course.credits,
      category: tags.requirement,
      reason: "講義詳細から追加した科目です。",
    };
    const problem = checkAddable(proposed, courses, target.term);
    if (problem) {
      setNotice(problem);
      return;
    }
    addCourse(proposed);
    router.push("/proposal");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-[18px] py-2.5 transition-colors hover:bg-primary-dark"
      >
        <CalendarPlus size={15} className="text-fg-inverse" aria-hidden="true" />
        <span className="text-[13.5px] font-bold text-fg-inverse">時間割に追加</span>
      </button>
      {notice && (
        <p role="status" className="max-w-[280px] text-[11.5px] leading-[17px] text-accent">
          {notice}
          {status !== "done" && status !== "loading" && (
            <>
              {" "}
              <Link href="/proposal" className="font-bold underline">
                時間割へ
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
