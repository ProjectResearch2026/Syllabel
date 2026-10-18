"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** 入力が止まってから検索するまでの待ち(ミリ秒) */
const DEBOUNCE_MS = 300;

/**
 * シラバス一覧の検索欄(科目名・教員名)の入力を、検索条件(URL の `q`)に反映する。design.md §8。
 *
 * **1文字ごとには検索しない。** `q` を変えるとサーバ側描画がやり直され、api-clean へ
 * 全件の取得(3本)と、科目名で0件なら教員名の引き直しが走る。以前は `onChange` の
 * たびに反映しており、「でーたべーす」を打つだけで api-clean へ26本のリクエストが出ていた。
 *
 * - **IME の変換中(`compositionstart` 〜 `compositionend`)は反映しない。** 変換前の
 *   ひらがな(「で」「でー」…)はほぼ0件で、教員名の引き直しまで走るうえ、
 *   「該当する科目がありません」が点滅する
 * - 変換の確定後・英数字の入力は、**入力が `DEBOUNCE_MS` 止まってから**反映する
 * - **Enter は待たずに反映する。** ただし変換の確定に押した Enter は除く
 *
 * **PC・モバイルの検索欄の双方から使う。** 入力欄は従来どおり非制御(`defaultValue`)で、
 * 返す props をそのまま `<input>` に渡す。
 */
export function useSearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const commit = useCallback(
    (value: string) => {
      cancel();
      // 待っているあいだに他の絞り込みが変わり得るため、反映する時点の URL から組む
      const params = new URLSearchParams(window.location.search);
      const word = value.trim();
      if ((params.get("q") ?? "") === word) return;
      if (word) params.set("q", word);
      else params.delete("q");
      params.delete("offset");
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname);
      });
    },
    [cancel, router, pathname],
  );

  const schedule = useCallback(
    (value: string) => {
      cancel();
      timer.current = setTimeout(() => commit(value), DEBOUNCE_MS);
    },
    [cancel, commit],
  );

  return {
    defaultValue: searchParams.get("q") ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      if (composing.current) return;
      schedule(e.currentTarget.value);
    },
    onCompositionStart: () => {
      composing.current = true;
      cancel();
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => {
      composing.current = false;
      schedule(e.currentTarget.value);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      // 変換の確定に押した Enter は検索の実行ではない
      if (e.key !== "Enter" || e.nativeEvent.isComposing || composing.current) return;
      commit(e.currentTarget.value);
    },
  };
}
