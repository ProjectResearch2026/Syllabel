"use client";

import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Gauge,
  ListChecks,
  Search,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import type { AiSuggestion } from "@/lib/ai";

const ICONS = {
  "circle-alert": CircleAlert,
  users: Users,
  gauge: Gauge,
  "list-checks": ListChecks,
  "calendar-days": CalendarDays,
  search: Search,
} as const;

/**
 * ハーフシートのサジェスト一覧（ui-design_phone.pen STEP4 SuggestList）。
 * 入口に応じて中身が差し替わるが、並びと見た目はどの文脈でも同じ。
 */
export default function AiSuggestList({
  label,
  items,
  onPick,
  disabled,
}: {
  label: string;
  items: AiSuggestion[];
  onPick: (suggestion: AiSuggestion) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2.5">
      <p className="text-[11px] font-bold text-fg-muted">{label}</p>
      {items.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <motion.button
            key={item.title}
            type="button"
            disabled={disabled}
            onClick={() => onPick(item)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.055, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex items-center gap-2.5 rounded-xl bg-surface-gray px-3 py-2.5 text-left transition-opacity active:opacity-70 disabled:opacity-50"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-primary">
              <Icon size={15} className="text-accent" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-bold text-fg-primary">{item.title}</span>
              <span className="text-[11px] text-fg-secondary">{item.sub}</span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-[#b6bcc7]" />
          </motion.button>
        );
      })}
    </div>
  );
}
