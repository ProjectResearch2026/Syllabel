"use client";

import { MotionConfig } from "motion/react";

/**
 * `motion` の動きを端末の「視差効果を減らす」設定に従わせる。
 * 動きを減らす設定では transform の動き(スライド・拡大・layoutId の移動)を止め、
 * 透明度の変化だけを残す。CSS の動きは各所の `motion-safe:` が受け持つ。
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
