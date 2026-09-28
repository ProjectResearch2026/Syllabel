"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, X } from "lucide-react";
import { useProposalStore } from "@/lib/proposal";

/**
 * 「別の科目に変更する」の途中であることを示す帯（シラバスの画面だけ）。
 *
 * 時間割の科目のメニューから来ると、学生はシラバス一覧・講義詳細を行き来して
 * 入れ替える科目を探す。そのあいだ何を入れ替えようとしているかを見失わないよう、
 * 画面の上に出し続ける。入れ替えは講義詳細のボタン（`AddToTimetableButton`）で行う。
 */
export default function ReplaceBanner() {
  const pathname = usePathname();
  const replacing = useProposalStore((s) => s.replacing);
  const cancelReplace = useProposalStore((s) => s.cancelReplace);

  if (!replacing || !pathname.startsWith("/syllabus")) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border-primary bg-accent-light px-4 py-2 md:fixed md:bottom-4 md:left-1/2 md:top-auto md:w-[min(640px,calc(100vw-32px))] md:-translate-x-1/2 md:rounded-lg md:border md:shadow-popover">
      <ArrowLeftRight size={15} className="shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12px] leading-5 text-fg-primary">
        <span className="font-bold">「{replacing.title}」</span>
        の変更先を選んでいます。講義詳細の「この科目に変更」で入れ替わります。
      </p>
      <Link
        href="/proposal"
        onClick={cancelReplace}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-fg-secondary transition-colors hover:bg-surface-primary"
      >
        <X size={13} aria-hidden="true" />
        やめる
      </Link>
    </div>
  );
}
