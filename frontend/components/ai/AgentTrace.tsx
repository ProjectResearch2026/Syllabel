"use client";

import { Brain, CalendarRange, FileText, Search } from "lucide-react";
import type { AgentActivity } from "@/lib/chatApi";

/**
 * AI が考えている様子（design.md §8.3.7）。吹き出しの本文の上に出す。
 *
 * - **思考**（`thinking`）は本文が届くまで小さく薄い字で流し、本文が始まったら
 *   「考えた過程」の1行に畳む（押すと開く）
 * - **進み具合**（`activity`）はツールの呼び出しごとに1つのチップで、backend が決めた
 *   文言（「シラバスを検索しています」）と、モデルが書いた引数（検索語・曜日・条件）を出す。
 *   引数は書きかけの間から伸びていく
 *
 * 思考も引数もモデルの出力であり、学生のブラウザにだけ流れる（サーバには残さない）。
 */
export default function AgentTrace({
  thinking,
  activities,
  answering,
  streaming,
}: {
  thinking?: string;
  activities?: AgentActivity[];
  /** 本文が届き始めた。思考を畳む */
  answering: boolean;
  streaming: boolean;
}) {
  const hasThinking = Boolean(thinking?.trim());
  if (!hasThinking && !activities?.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {hasThinking &&
        (answering || !streaming ? (
          <details className="group text-[11px] leading-[17px] text-fg-tertiary">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold">
              <Brain size={12} aria-hidden="true" />
              考えた過程
              <span className="text-[10px] font-normal group-open:hidden">（押すと開く）</span>
            </summary>
            <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{thinking!.trim()}</p>
          </details>
        ) : (
          // 書いている最中は末尾だけを見せる。上に流れていく
          <div className="flex max-h-[68px] flex-col-reverse overflow-hidden" aria-live="off">
            <p className="whitespace-pre-wrap text-[11px] leading-[17px] text-fg-tertiary">
              {thinking!.trim()}
            </p>
          </div>
        ))}

      {activities?.map((activity, i) => {
        const current = streaming && !answering && i === activities.length - 1;
        const detail = describeArgs(activity);
        return (
          <span
            key={activity.id}
            role={current ? "status" : undefined}
            className="flex w-fit max-w-full items-center gap-1.5 rounded-full bg-surface-gray px-2.5 py-1 text-[11px] leading-4 text-fg-secondary motion-safe:animate-fade-in"
          >
            <ToolIcon tool={activity.tool} />
            <span className={`shrink-0 whitespace-nowrap ${current ? "font-semibold text-fg-primary" : ""}`}>
              {current ? activity.label : doneLabel(activity)}
            </span>
            {detail && <span className="min-w-0 truncate text-fg-tertiary">{detail}</span>}
            {current && (
              <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                <span className="size-1 animate-bounce rounded-full bg-fg-secondary" />
                <span className="size-1 animate-bounce rounded-full bg-fg-secondary [animation-delay:150ms]" />
                <span className="size-1 animate-bounce rounded-full bg-fg-secondary [animation-delay:300ms]" />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const Icon = tool === "build_timetable" ? CalendarRange : tool === "get_course" ? FileText : Search;
  return <Icon size={12} className="shrink-0" aria-hidden="true" />;
}

/** 終わった呼び出しの文言。「〜しています」を「〜した」に寄せる */
function doneLabel(activity: AgentActivity): string {
  switch (activity.tool) {
    case "build_timetable":
      return "時間割を組んだ";
    case "search_courses":
      return "シラバスを検索した";
    case "get_course":
      return "シラバスを読んだ";
    default:
      return "調べた";
  }
}

const SCOPE_LABEL: Record<string, string> = {
  必修のみ: "必修だけ",
  不足を埋める: "不足を埋める",
  広く: "広く",
};

/** モデルが書いた引数を短く読める形にする。分からない引数は値だけを並べる */
function describeArgs({ tool, args }: AgentActivity): string {
  const parts: string[] = [];
  const text = (v: unknown) =>
    Array.isArray(v) ? v.map(String).join("・") : typeof v === "object" ? "" : String(v);
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (tool === "build_timetable") {
      const label = buildArg(key, value, text);
      if (label) parts.push(label);
      continue;
    }
    if (key === "limit" || key === "only_registrable" || key === "include_taken") continue;
    if (key === "sections") continue;
    if (key === "period" && typeof value === "number") parts.push(`${value}限`);
    else if (key === "day") parts.push(`${text(value)}曜`);
    else if (key === "topic" || key === "keyword") parts.push(`「${text(value)}」`);
    else parts.push(text(value));
  }
  return parts.filter(Boolean).join(" ");
}

function buildArg(key: string, value: unknown, text: (v: unknown) => string): string | null {
  switch (key) {
    case "mode":
      return value === "adjust" ? "今の時間割を直す" : "組み直す";
    case "scope":
      return SCOPE_LABEL[String(value)] ?? text(value);
    case "free_days":
      return `全休 ${text(value)}`;
    case "free_day_count":
      return Number(value) > 0 ? `全休${value}日` : null;
    case "avoid_periods":
      return `避ける ${text(value)}`;
    case "max_days":
      return Number(value) > 0 ? `週${value}日まで` : null;
    case "max_periods_per_day":
      return `1日${value}コマまで`;
    case "target_credits":
      return Number(value) > 0 ? `${value}単位` : null;
    case "include":
      return `入れる ${text(value)}`;
    case "exclude":
      return `入れない ${text(value)}`;
    default:
      return text(value) || null;
  }
}
