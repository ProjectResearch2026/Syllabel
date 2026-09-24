"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 値が変わったとき、前の値から新しい値まで数え上げて見せる数字。
 *
 * 提案が出たときや時間割を変えたときに単位数が変わっても、数字が差し替わるだけでは
 * 気づきにくい。**数え上げるのは値から値へ変わったときだけ**で、`null`(まだ無い)から
 * 値が出たときと、動きを減らす設定の端末ではそのまま出す。
 *
 * 数えているあいだだけ `countingClassName` を足す(少し拡大するなど)。
 */
export default function AnimatedNumber({
  value,
  className = "",
  countingClassName = "",
}: {
  value: number | null;
  className?: string;
  countingClassName?: string;
}) {
  // 数えている途中の値。数えていないときは null で、`value` をそのまま出す
  const [tween, setTween] = useState<number | null>(null);
  // 画面に出ている値。途中で値が変わったら、そこから数え直す
  const shownRef = useRef(value);
  const reduce = useReducedMotion();

  useEffect(() => {
    const from = shownRef.current;
    if (value === null || from === null || from === value || reduce) {
      shownRef.current = value;
      return;
    }
    // 目標が整数なら途中も整数で、0.5 を含むなら 0.5 刻みで出す
    const step = Number.isInteger(value) && Number.isInteger(from) ? 1 : 0.5;
    const controls = animate(from, value, {
      duration: 0.45,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (v) => {
        shownRef.current = v;
        setTween(Math.round(v / step) * step);
      },
      onComplete: () => {
        shownRef.current = value;
        setTween(null);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  const counting = tween !== null && value !== null;
  return (
    <span className={`${className} ${counting ? countingClassName : ""}`}>
      {counting ? fmt(tween!) : value === null ? "—" : fmt(value)}
    </span>
  );
}
