"use client";

import Link from "next/link";
import { ChevronRight, FileUp, Info } from "lucide-react";
import { useStudentStore } from "@/lib/student";

/**
 * 「成績表を取り込むとタグで絞り込める」ことの案内。design.md §8。
 *
 * **タグは学生プロファイルとの突合で決まる**(§6.1)。プロファイルが無いあいだは
 * どのコードにもタグが付かないため、**上のチップも区分のセレクトも、押せるのに
 * 必ず0件になる**(`matchesFilter()` は `tags.requirement === activeTag` を見る)。
 * そのうえ出る文言は「絞り込みに該当する科目がありません」で、**本当の理由が
 * どこにも出ていなかった**。要件§4.5 の主機能(個人の状況に紐づいた検索)が
 * 丸ごと効いていないことに、学生が気づけない。
 *
 * **チップの直下に、絞り込みを試す前に見える形で出す。** 以前は PC の左サイドバー
 * 「区分」の下に 11px のグレーで1行あるだけで(`SyllabusFilters.tsx`)、モバイルには
 * それすら無かった。
 *
 * **プロファイルがあるときは出さない。** 「取り込むと絞れます」は取り込んだ後には
 * 誤りであり、常時表示のままだと取り込み済みかどうかの手がかりにならない。
 *
 * **PC・モバイルで同じものを使う**(`CourseTags` / `SyllabusPagination` と同じ理由。
 * §8)。文言を1か所に閉じるため、サイドバーに出す短い注記もこのファイルに置く。
 */
export default function SyllabusProfileNotice() {
  const profile = useStudentStore((s) => s.profile);
  if (profile) return null;

  return (
    <Link
      href="/import"
      className="group flex items-center gap-2.5 border-b border-[#D1D5DB] bg-[#EEF1F8] px-4 py-2.5 transition-colors hover:bg-[#E2E8F4] md:px-8"
    >
      <FileUp size={17} aria-hidden="true" className="shrink-0 text-[#1A2B4E]" />
      <p className="min-w-0 text-[12px] leading-snug text-[#1A2B4E] md:text-[13px]">
        <span className="font-bold">成績表を取り込むと、上のタグで絞り込めます</span>
        {/* 補足は狭い画面では畳む。1行に収まらないと本文まで読まれない */}
        <span className="ml-1.5 hidden text-[#4B5563] md:inline">
          必修・選択・修得済みは、取り込んだ学生情報から判定します
        </span>
      </p>
      <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-[#E60012] md:text-[13px]">
        取り込む
        <ChevronRight size={15} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * 絞り込みパネルの「区分」に添える短い注記。上のバーと同じ条件で出す。
 *
 * 区分のセレクトはパネルを開かないと見えない(モバイル)・スクロールの先にある(PC)
 * ため、バーを見ていない学生もここで気づけるようにしておく。
 */
export function CategoryFilterHint() {
  const profile = useStudentStore((s) => s.profile);
  if (profile) return null;

  return (
    <span className="flex items-start gap-1 rounded bg-[#EEF1F8] px-2 py-1 text-[11px] font-semibold leading-snug text-[#1A2B4E]">
      <Info size={12} aria-hidden="true" className="mt-[1px] shrink-0" />
      {/* 何を取り込むかは上のバーが言っている。ここは幅の狭い枠に1行で収める */}
      取り込むと絞れます
    </span>
  );
}
