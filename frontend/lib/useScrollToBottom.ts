"use client";

import { useEffect, useRef, type RefObject } from "react";

/** 最下部からこの距離(px)以内なら「最下部に居る」とみなす。指や慣性のずれを許す */
const STICK_DISTANCE = 48;

/**
 * 会話欄を最下部へ追従させる。返った ref は**スクロールする要素**
 * (`overflow-y-auto` を持つ側)に付ける。
 *
 * **追従するのは、学生が最下部に居るあいだだけである。** 本文の受信中に学生が上へ
 * 戻って読み返しているときに引き戻さない。吹き出しが増えたとき(学生が送った・
 * 応答の吹き出しが現れた)は、どこに居ても最下部へ移す。
 *
 * **追従は即時に行う(`behavior: "auto"`)。** 本文・思考は1文字ずつ届くので、届くたびに
 * 滑らかなスクロールを始めると、動きが終わる前に次が始まって表示が本文に追い付かず、
 * 学生のスクロールとも取り合いになる。
 *
 * **会話欄そのものが縮んだときも、最下部に居れば最下部に留める。** 入力欄が複数行に
 * 伸びる・キーボードが出る・シートの高さを変えると会話欄の高さが減るが、スクロール位置は
 * そのまま残るため、末尾の吹き出しや「希望条件なしで提案する」が入力欄の陰に隠れていた。
 *
 * `scrollIntoView()` は使わない。**祖先まで遡ってスクロールできる要素をすべて
 * 動かす**ため、会話欄が伸びきって内側にスクロールが生じない画面(講義詳細の
 * 右パネルなど)では代わりにページ本体が動き、画面を開いた直後に本文がわずかに
 * スクロールしてしまう。`Element.scrollTo()` はその要素しか動かさない。
 *
 * @param trigger 変化したら追従させたい値(メッセージ配列など)
 * @param count 吹き出しの数。増えたときは学生の位置によらず最下部へ移す
 */
export function useScrollToBottom<T extends HTMLElement>(
  trigger: unknown,
  count: number,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  const lastCount = useRef(count);

  // 学生のスクロールで「最下部に居るか」を更新する。追従のための scrollTo も
  // 最下部に着くので、ここで true に戻る
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      pinned.current = distance <= STICK_DISTANCE;
    };
    // 高さが変わってもスクロールイベントは来ないので、ここで最下部へ戻す
    const resize = new ResizeObserver(() => {
      if (pinned.current) element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
    });
    element.addEventListener("scroll", onScroll, { passive: true });
    resize.observe(element);
    return () => {
      element.removeEventListener("scroll", onScroll);
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const added = count !== lastCount.current;
    lastCount.current = count;
    if (!added && !pinned.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
    pinned.current = true;
  }, [trigger, count]);

  return ref;
}
