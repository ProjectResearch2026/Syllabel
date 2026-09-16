"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 検索結果のページ送り。design.md §6.2 / §8。
 *
 * **総件数は必ず確定する。** 検索は条件に当たる全件を引くため(§6.2)、
 * `total` は絞り込み後の件数そのものである。従来は api-clean が総件数を
 * 返さないため数え上げに失敗することがあり、その場合は前後移動しか出せなかった。
 * いまはつねにページ番号を並べ、最後のページへも1回で飛べる。
 */
type Props = {
  limit: number;
  offset: number;
  /** 絞り込み後の総件数 */
  total: number;
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

export default function SyllabusPagination({ limit, offset, total }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
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
  const last = Math.max(1, Math.ceil(total / limit));

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

      <button onClick={() => goToOffset(offset + limit)} disabled={!hasNext} className={buttonClass}>
        次へ
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
