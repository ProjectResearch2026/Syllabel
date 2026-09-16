"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 検索結果のページ送り。design.md §6.2 / §8。
 *
 * **総件数は `countCourses()` で数えている**(api-clean は返さない)。数えられた
 * ときはページ番号を並べ、最後のページへも1回で飛べるようにする。数えられ
 * なかったときは前後移動と現在位置だけにとどめる。
 */
type Props = {
  limit: number;
  offset: number;
  /** このページに実際に載っている件数 */
  shown: number;
  hasNext: boolean;
  /** 総件数。数えられなかったときは null */
  total: number | null;
};

/** 現在のページの前後に並べるページ番号の数 */
const WINDOW = 2;

function pageNumbers(current: number, last: number): number[] {
  const from = Math.max(1, Math.min(current - WINDOW, last - WINDOW * 2));
  const to = Math.min(last, Math.max(current + WINDOW, WINDOW * 2 + 1));
  const pages: number[] = [];
  for (let page = from; page <= to; page += 1) pages.push(page);
  return pages;
}

export default function SyllabusPagination({ limit, offset, shown, hasNext, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasPrev = offset > 0;
  if (!hasPrev && !hasNext) return null;

  const goToOffset = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 0) params.delete("offset");
    else params.set("offset", String(next));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: true });
    });
  };

  const current = Math.floor(offset / limit) + 1;
  const last = total !== null ? Math.max(1, Math.ceil(total / limit)) : null;

  const buttonClass =
    "flex h-8 min-w-8 items-center justify-center rounded-lg border border-[#D1D5DB] px-2 text-xs transition-colors disabled:opacity-40 enabled:hover:border-[#1A2B4E]";

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-1.5 ${isPending ? "opacity-50" : ""}`}
    >
      <button onClick={() => goToOffset(offset - limit)} disabled={!hasPrev} className={buttonClass}>
        <ChevronLeft size={14} aria-hidden="true" />
        前へ
      </button>

      {last !== null ? (
        <>
          {pageNumbers(current, last).map((page) => (
            <button
              key={page}
              onClick={() => goToOffset((page - 1) * limit)}
              aria-current={page === current ? "page" : undefined}
              className={
                page === current
                  ? "flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#1A2B4E] px-2 text-xs font-bold text-white"
                  : buttonClass
              }
            >
              {page}
            </button>
          ))}
          {/* 最後のページは1回で出せるようにする。1,200件規模で40回送らせない */}
          {!pageNumbers(current, last).includes(last) && (
            <>
              <span className="px-0.5 text-xs text-[#9CA3AF]">…</span>
              <button onClick={() => goToOffset((last - 1) * limit)} className={buttonClass}>
                {last}
              </button>
            </>
          )}
        </>
      ) : (
        <span className="px-2 text-xs text-[#6B7280]">
          {shown > 0 ? `${offset + 1}〜${offset + shown}件目` : "該当なし"}
        </span>
      )}

      <button onClick={() => goToOffset(offset + limit)} disabled={!hasNext} className={buttonClass}>
        次へ
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
