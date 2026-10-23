"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const MARGIN = 16;

type Rect = { top: number; left: number; width: number; height: number };

/** 画面のうちメニューを置ける下端。モバイルはボトムドックの上まで(PC はドックが隠れていて高さ0) */
function bottomLimit(): number {
  let bottom = window.innerHeight;
  for (const dock of document.querySelectorAll("[data-bottom-dock]")) {
    const r = dock.getBoundingClientRect();
    if (r.height > 0) bottom = Math.min(bottom, r.top);
  }
  return bottom - MARGIN;
}

/**
 * 押したマスに添えて出すその場のメニュー(`CourseMenu` / `SlotPopover`)の置き場所と、
 * 開いているあいだのスクロール止め。PC・モバイル共通。
 *
 * **置き場所はメニューの実際の高さで決める。** 高さを決め打ちしていた頃は、区分の行や
 * 「AIに相談する」のぶん実際のほうが高く、モバイルではボトムドック(`data-bottom-dock`)の
 * 裏に下半分が隠れていた。マスの下に入ればその下、入らなければ上、どちらにも入らなければ
 * 広いほうに置いて、メニューの中をスクロールさせる(`maxHeight`)。
 *
 * **開いているあいだは裏のページをスクロールさせない。** メニューは押した瞬間のマスの
 * 位置に `fixed` で置くので、スクリムの上の指の動きで裏のページが動くと、浮かせたマスと
 * メニューだけが元の位置に残ってずれる。外側の要素に `touch-none` を付けるのと合わせて、
 * ルートの `overflow` を止める。
 */
export function useAnchoredMenu(rect: Rect, width: number, gap: number) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; maxHeight?: number } | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // `maxHeight` で詰めたあとでも中身の高さを測れるよう scrollHeight を使う
    const height = menu.scrollHeight;
    const bottom = bottomLimit();
    const below = rect.top + rect.height + gap;
    const above = rect.top - gap - height;
    if (below + height <= bottom) setPlace({ top: below });
    else if (above >= MARGIN) setPlace({ top: above });
    else {
      const roomBelow = bottom - below;
      const roomAbove = rect.top - gap - MARGIN;
      setPlace(
        roomBelow >= roomAbove
          ? { top: below, maxHeight: Math.max(roomBelow, 0) }
          : { top: MARGIN, maxHeight: Math.max(roomAbove, 0) },
      );
    }
  }, [rect.top, rect.height, gap]);

  const centered = rect.left + rect.width / 2 - width / 2;
  const left = Math.min(Math.max(centered, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));

  // 測るまでは見せない(useLayoutEffect なので描く前に決まる)
  const style: CSSProperties = place
    ? { top: place.top, left, width, maxHeight: place.maxHeight }
    : { top: 0, left, width, visibility: "hidden" };
  return { menuRef, style };
}
