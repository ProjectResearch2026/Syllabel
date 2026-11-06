"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { backLink } from "@/lib/syllabusQuery";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

/**
 * 詳細画面の「戻る」。design.md §8.1。
 *
 * **戻り先はストアから決める**(URL には載せない。`lib/syllabusQuery.ts`)。時間割から
 * 開いた講義なら「時間割に戻る」、それ以外は最後に開いていた一覧へ「シラバス一覧に戻る」。
 * ストアはメモリにだけあるため、再読み込み・直リンクでは素の一覧(`/syllabus`)へ戻る。
 */
export default function BackLink({ code }: { code: string }) {
  const proposalOrigin = useSyllabusUIStore((s) => s.proposalOrigin);
  const listQuery = useSyllabusUIStore((s) => s.listQuery);
  const back = backLink(code, { proposalOrigin, listQuery });

  return (
    <Link
      href={back.href}
      className="flex h-12 items-center gap-1.5 border-b border-border-primary bg-surface-primary px-4 text-[13px] font-semibold text-fg-primary md:-ml-1.5 md:inline-flex md:h-auto md:w-fit md:gap-1 md:rounded-lg md:border-0 md:bg-transparent md:px-1.5 md:py-1 md:font-medium md:text-fg-secondary md:transition-colors md:hover:bg-surface-primary md:hover:text-fg-primary"
    >
      <ChevronLeft size={18} className="md:size-4" aria-hidden="true" />
      {back.label}
    </Link>
  );
}
