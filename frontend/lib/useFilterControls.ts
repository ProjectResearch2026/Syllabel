"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

/**
 * タグの絞り込み(履修区分・状態のチップと区分のセレクト)の操作。design.md §8。
 *
 * **絞り込みを変えたらページ位置を先頭へ戻す。** 絞り込みはクライアント状態に
 * あり(§8)、`offset` は URL に持っている(詳細画面から戻ったときに位置を保つため。
 * `lib/syllabusQuery.ts`)。この2つが別の場所にあるため、絞り込みだけを変えると
 * **前の絞り込みでのページ位置が残る**。実際「修得済みの2ページ目」から
 * 「選択必修」に切り替えると、38件しかないのに31件目から表示されていた。
 *
 * 検索語やキャンパスなどの絞り込みは `offset` を消してから遷移している
 * (`update()`)。タグ側も同じ扱いに揃える。
 *
 * **PC・モバイルの双方から呼ぶ。** 同じ挙動でなければならないため、ここに1つ置く。
 */
export function useFilterControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const activeCategory = useSyllabusUIStore((s) => s.activeCategory);
  const setActiveTag = useSyllabusUIStore((s) => s.setActiveTag);
  const setActiveCategory = useSyllabusUIStore((s) => s.setActiveCategory);

  const resetOffset = useCallback(() => {
    if (!searchParams.get("offset")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("offset");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: true });
  }, [router, pathname, searchParams]);

  const selectTag = useCallback(
    (tag: string) => {
      setActiveTag(tag);
      resetOffset();
    },
    [setActiveTag, resetOffset],
  );

  const selectCategory = useCallback(
    (category: string) => {
      setActiveCategory(category);
      resetOffset();
    },
    [setActiveCategory, resetOffset],
  );

  return { activeTag, activeCategory, selectTag, selectCategory };
}
