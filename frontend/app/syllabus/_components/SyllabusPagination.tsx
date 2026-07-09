"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Props = {
  total: number;
  limit: number;
  offset: number;
};

export default function SyllabusPagination({ total, limit, offset }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("offset", String((page - 1) * limit));
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const pages: number[] = [];
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    pages.push(i);
  }

  return (
    <div className={`flex items-center justify-center gap-1 mt-4 ${isPending ? "opacity-50" : ""}`}>
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1.5 text-xs border border-[#D1D5DB] rounded-lg disabled:opacity-40 hover:border-[#1A2B4E] transition-colors"
      >
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => goToPage(p)}
          className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
            p === currentPage
              ? "bg-[#1A2B4E] text-white border-[#1A2B4E]"
              : "border-[#D1D5DB] hover:border-[#1A2B4E]"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-xs border border-[#D1D5DB] rounded-lg disabled:opacity-40 hover:border-[#1A2B4E] transition-colors"
      >
        ›
      </button>
      <span className="text-xs text-[#6B7280] ml-2">
        {total}件中 {offset + 1}〜{Math.min(offset + limit, total)}件
      </span>
    </div>
  );
}
