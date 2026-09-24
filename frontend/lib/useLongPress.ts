"use client";

import { useCallback, useRef } from "react";
import type { SlotTarget } from "@/app/_components/SlotPopover";

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

/**
 * 空きコマの長押し（モバイル。ui-design_phone.pen AI_STEP3）。週表示のマスと曜日表示の
 * 空きコマの枠で同じ動きにするため、ここに1つだけ置く。
 *
 * `bind(day, period)` を要素に広げると、長押しで `onLongPress`（その場のメニュー）、
 * 軽く押すと `onTap`（選択を外す）を呼ぶ。指が動いたらスクロールとみなして取り消す。
 */
export function useLongPress({
  onLongPress,
  onTap,
}: {
  onLongPress: (target: SlotTarget) => void;
  onTap?: () => void;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const bind = useCallback(
    (day: string, period: number) => ({
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          const rect = el.getBoundingClientRect();
          fired.current = true;
          timer.current = null;
          onLongPress({
            day,
            period,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          });
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!origin.current) return;
        const moved =
          Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE ||
          Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE;
        if (moved) cancel();
      },
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onPointerUp: () => {
        const wasLongPress = fired.current;
        cancel();
        if (!wasLongPress) onTap?.();
      },
    }),
    [cancel, onLongPress, onTap],
  );

  return bind;
}
