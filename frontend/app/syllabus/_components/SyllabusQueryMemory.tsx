"use client";

import { useEffect } from "react";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

/**
 * 一覧の検索条件(URL のクエリ)を決まった形に直し、ストアに書き写す。design.md §8。
 *
 * `query` は `page.tsx` が `canonicalListParams()` で直したクエリで、一覧はこれで描いて
 * ある。**アドレスバーがこれと違えば書き換える**(`?q=音響&` の末尾の `&`・知らないキー・
 * 空の値・選べない値)。一覧の中身は変わらないので、描き直さない `history.replaceState()`
 * を使う(Next.js の `useSearchParams()` も追従する)。
 *
 * 詳細画面の「シラバス一覧に戻る」とヘッダー・タブバーの「シラバス」はこの写しを付けて
 * 一覧を開く(`listHref()`)。**一覧を開いたら、時間割から開いた印(`proposalOrigin`)を
 * 下ろす** — ここから開いた講義の「戻る」は一覧へ向ける。
 * **描画は何もしない。** PC・モバイルのどちらのレイアウトでも効くよう、一覧のページに
 * 1つだけ置く。
 */
export default function SyllabusQueryMemory({ query }: { query: string }) {
  const setListQuery = useSyllabusUIStore((s) => s.setListQuery);
  const setProposalOrigin = useSyllabusUIStore((s) => s.setProposalOrigin);

  useEffect(() => {
    if (window.location.search.replace(/^\?/, "") !== query) {
      const { pathname, hash } = window.location;
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
    }
    setListQuery(query);
    setProposalOrigin("");
  }, [query, setListQuery, setProposalOrigin]);

  return null;
}
