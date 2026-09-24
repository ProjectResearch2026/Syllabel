"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { pickListParams } from "@/lib/syllabusQuery";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

/**
 * 一覧の検索条件(URL のクエリ)をストアに書き写す。design.md §8。
 *
 * ヘッダー・タブバーの「シラバス」はこの写しを付けて一覧を開く
 * (`listHref()`)。**描画は何もしない。** PC・モバイルのどちらの
 * レイアウトでも効くよう、一覧のページに1つだけ置く。
 */
export default function SyllabusQueryMemory() {
  const searchParams = useSearchParams();
  const setListQuery = useSyllabusUIStore((s) => s.setListQuery);
  const query = pickListParams(searchParams).toString();

  useEffect(() => {
    setListQuery(query);
  }, [query, setListQuery]);

  return null;
}
