"use client";

import { useState } from "react";

/**
 * 講義詳細のタブ（ui-design_pc.pen 06_講義詳細 TabBar）。
 *
 * 1画面に全部積むと縦に長くなりすぎるため、概要 / 授業計画 / 成績評価 /
 * 教材・履修上の注意 の4つに割る。**中身が無いタブは出さない。** 空のタブを
 * 押せてしまうと、データが無いのか読み込みに失敗したのかが分からない。
 *
 * パネルの中身はサーバ側で組み立てて渡す（ここは出し分けだけを持つ）。
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
        className="flex shrink-0 gap-1 border-b border-card-divider"
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
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${
                selected
                  ? "border-accent font-bold text-fg-primary"
                  : "border-transparent font-medium text-fg-muted hover:text-fg-primary"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        className="flex flex-col gap-4"
      >
        {current.panel}
      </div>
    </>
  );
}
