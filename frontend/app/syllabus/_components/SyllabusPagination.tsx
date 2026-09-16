"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * 検索結果のページ送り。design.md §6.2。
 *
 * **総ページ数は出せない。** api-clean は総ヒット数を返さず(`count` はその
 * ページの件数)、総件数を返す口も無いため、ページ番号を並べる UI にはできない。
 * 分かるのは「次があるか」だけなので、前後移動と現在位置の表示にとどめる。
 */
type Props = {
  limit: number;
  offset: number;
  /** このページに実際に載っている件数 */
  shown: number;
  hasNext: boolean;
};

export default function SyllabusPagination({ limit, offset, shown, hasNext }: Props) {
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
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const buttonClass =
    "px-3 py-1.5 text-xs border border-[#D1D5DB] rounded-lg disabled:opacity-40 enabled:hover:border-[#1A2B4E] transition-colors";

  return (
    <div className={`flex items-center justify-center gap-2 mt-4 ${isPending ? "opacity-50" : ""}`}>
      <button
        onClick={() => goToOffset(offset - limit)}
        disabled={!hasPrev}
        className={buttonClass}
      >
        ‹ 前へ
      </button>
      <span className="text-xs text-[#6B7280]">
        {shown > 0 ? `${offset + 1}〜${offset + shown}件目` : "該当なし"}
      </span>
      <button
        onClick={() => goToOffset(offset + limit)}
        disabled={!hasNext}
        className={buttonClass}
      >
        次へ ›
      </button>
    </div>
  );
}
