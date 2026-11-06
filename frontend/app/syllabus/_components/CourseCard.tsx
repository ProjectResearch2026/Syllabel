import Link from "next/link";
import { User, Award, Clock, GraduationCap, ArrowUpRight } from "lucide-react";
import type { SyllabusListItem } from "@/lib/syllabus-api";
import { formatSlots } from "@/lib/schedule";
import type { CourseTags as CourseTagsType } from "@/lib/syllabusUI";
import CourseTags from "./CourseTags";

export default function CourseCard({
  course,
  tags,
  instructors,
  href,
  style,
}: {
  course: SyllabusListItem;
  /** 状態 / 区分 / 履修区分のタグ一式(§8) */
  tags: CourseTagsType;
  /** 担当教員名(一覧の `instructors` を整形したもの。§6.2)。担当者が無ければ null */
  instructors?: string | null;
  /** 詳細画面への宛先(`detailHref()`) */
  href: string;
  /** 一覧で順に現れるときの遅れ(`animationDelay`) */
  style?: React.CSSProperties;
}) {
  const grade =
    course.grade_min === course.grade_max
      ? `${course.grade_min}年次`
      : `${course.grade_min}〜${course.grade_max}年次`;

  return (
    <Link
      href={href}
      // **先読みしない**(§8.2.4)。一覧は1ページに30枚並び、画面に入ったカードごとに
      // 詳細画面を裏で取りに行くと、ページ送りだけで入口の回数制限に届く。詳細画面は
      // `loading.tsx` を持つ動的なページで、先読みしても内容までは取らないため、
      // 止めても内容が出るまでの時間は変わらない
      prefetch={false}
      style={style}
      className="group flex min-h-[172px] flex-col justify-between rounded-xl border border-card-border bg-surface-primary p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-card-border-hover hover:shadow-popover motion-safe:animate-rise-in"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="tabular-nums text-[11px] font-bold tracking-[0.04em] text-fg-muted">
          {course.syllabus_code}
        </span>
        <ArrowUpRight
          size={17}
          strokeWidth={1.8}
          aria-hidden="true"
          className="shrink-0 text-fg-icon transition-colors group-hover:text-accent"
        />
      </div>

      <div className="mt-3 min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <CourseTags tags={tags} />
          <span className="rounded-md border border-tag-term-border bg-tag-term-bg px-2 py-0.5 text-[10px] font-semibold text-tag-term-fg">
            {course.term}
          </span>
        </div>

        <p className="line-clamp-2 text-[15px] font-bold leading-6 text-fg-primary transition-colors group-hover:text-accent">
          {course.course_title}
          {course.subtitle && (
            <span className="ml-1 text-xs font-normal text-fg-muted">({course.subtitle})</span>
          )}
        </p>

        {/*
          教員名は描いたあとに届く(`useTaggedResults`)。届いた時点で行を足すとカードが
          伸びて並びがずれるため、**取得前から同じ高さの行を置いておき、中身だけ入れる**
        */}
        <p
          className={`mt-2 flex min-w-0 items-center gap-1 text-[11.5px] text-fg-secondary ${
            instructors ? "" : "invisible"
          }`}
        >
          <User size={13} className="shrink-0 text-fg-icon" />
          <span className="truncate">{instructors ?? "\u00a0"}</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-card-divider border-t border-card-divider pt-3 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1 pr-2">
          <Award size={13} className="shrink-0 text-fg-icon" />
          {course.credits}単位
        </span>
        <span className="flex items-center gap-1 px-2">
          <Clock size={13} className="shrink-0 text-fg-icon" />
          {formatSlots(course)}
        </span>
        <span className="flex min-w-0 items-center gap-1 pl-2">
          <GraduationCap size={13} className="shrink-0 text-fg-icon" />
          <span className="truncate">{course.campus} / {grade}</span>
        </span>
      </div>
    </Link>
  );
}
