"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * 会話欄を最下部へ追従させる。返った ref は**スクロールする要素**
 * (`overflow-y-auto` を持つ側)に付ける。
 *
 * `scrollIntoView()` は使わない。**祖先まで遡ってスクロールできる要素をすべて
 * 動かす**ため、会話欄が伸びきって内側にスクロールが生じない画面(講義詳細の
 * 右パネルなど)では代わりにページ本体が動き、画面を開いた直後に本文がわずかに
 * スクロールしてしまう。`Element.scrollTo()` はその要素しか動かさない。
 *
 * 初回の描画では最下部に居るのと見え方が変わらないため、滑らかな追従は2回目
 * 以降に限る(開いた瞬間にアニメーションさせない)。
 *
 * @param trigger 変化したら追従させたい値(メッセージ配列など)
 */
export function useScrollToBottom<T extends HTMLElement>(trigger: unknown): RefObject<T | null> {
  const ref = useRef<T>(null);
  const scrolledOnce = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: scrolledOnce.current ? "smooth" : "auto",
    });
    scrolledOnce.current = true;
  }, [trigger]);

  return ref;
}
