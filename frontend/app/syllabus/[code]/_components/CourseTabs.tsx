"use client";

import { useState } from "react";
import { motion } from "motion/react";

/**
 * 講義詳細のタブ（ui-design_pc.pen 06_講義詳細 TabBar）。
 *
 * 1画面に全部積むと縦に長くなりすぎるため、概要 / 授業計画 / 成績評価 /
 * 教材・履修上の注意 の4つに割る。**中身が無いタブは出さない。** 空のタブを
 * 押せてしまうと、データが無いのか読み込みに失敗したのかが分からない。
 *
 * パネルの中身はサーバ側で組み立てて渡す（ここは出し分けだけを持つ）。
 *
 * 下線は1本だけで、選んだタブへ横に滑る(layoutId)。パネルは切り替えのたびに
 * 作り直してふわっと出す。
 */
export type CourseTab = {
  id: string;
  label: string;
  panel: React.ReactNode;
};

export default function CourseTabs({ tabs }: { tabs: CourseTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  if (tabs.length === 0) return null;

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <>
      <div
        role="tablist"
        aria-label="シラバスの内訳"
        // モバイルは白地の横スクロール(ui-design_phone.pen CourseTabs)
        className="flex shrink-0 gap-0 overflow-x-auto border-b border-border-primary bg-surface-primary px-2 [scrollbar-width:none] md:gap-1 md:overflow-visible md:border-card-divider md:bg-transparent md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`relative -mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent p-3 text-[13px] transition-colors md:px-3.5 md:py-2.5 ${
                selected
                  ? "font-bold text-accent md:text-fg-primary"
                  : "text-fg-secondary md:font-medium md:text-fg-muted md:hover:text-fg-primary"
              }`}
            >
              {tab.label}
              {selected && (
                <motion.span
                  layoutId="course-tab-underline"
                  className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-accent"
                  transition={{ type: "spring", damping: 28, stiffness: 400, mass: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        key={current.id}
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className="flex flex-col gap-3 px-4 pb-4 pt-3 motion-safe:animate-fade-in md:gap-4 md:p-0"
      >
        {current.panel}
      </div>
    </>
  );
}
