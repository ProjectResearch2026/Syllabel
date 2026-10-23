"use client";

import { useState } from "react";
import { Brain, CalendarRange, ChevronRight, FileText, Search } from "lucide-react";
import type { AgentActivity } from "@/lib/chatApi";
import type { TraceItem } from "@/lib/chat";
import { useScrollToBottom } from "@/lib/useScrollToBottom";

/**
 * AI が考えている様子（design.md §8.3.7）。吹き出しの本文の上に、届いた順に1行ずつ出す。
 * Claude Code の会話の出し方にならう。
 *
 * - **思考**は1行に畳み、押すと全文を開く。考えているあいだは「考えています」と最新の
 *   1行を、終わったら「○秒考えました」を出す。開いた全文は枠の中でスクロールでき、
 *   考えているあいだは末尾に追従する(上へ戻して読んでいるときは引き戻さない)。
 *   **全文はいつでも開ける** — 末尾だけを流していた頃は、流れて消えた分を読めなかった
 * - **ツールの呼び出し**も1行で、呼んでいるあいだは backend が決めた文言(「シラバスを
 *   検索しています」)、終わったら過去形にし、モデルが書いた引数を短く添える。押すと
 *   引数を1つずつ開く
 *
 * 思考も引数もモデルの出力であり、学生のブラウザにだけ流れる（サーバには残さない）。
 */
export default function AgentTrace({ trace, streaming }: { trace?: TraceItem[]; streaming: boolean }) {
  if (!trace?.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {trace.map((item, i) =>
        item.kind === "thinking" ? (
          <ThinkingRow key={`t${i}`} item={item} live={streaming && item.endedAt === undefined} />
        ) : (
          <ToolRow
            key={item.activity.id}
            activity={item.activity}
            live={streaming && item.endedAt === undefined}
          />
        ),
      )}
    </div>
  );
}

/** 畳んだ行。押すと中身を開く。Claude Code の行と同じく、アイコン・文言・矢印の1行 */
function TraceRow({
  icon,
  label,
  preview,
  live,
  open,
  onToggle,
  expandable,
}: {
  icon: React.ReactNode;
  label: string;
  preview?: string;
  live: boolean;
  open: boolean;
  onToggle: () => void;
  expandable: boolean;
}) {
  return (
    <button
      type="button"
      onClick={expandable ? onToggle : undefined}
      aria-expanded={expandable ? open : undefined}
      disabled={!expandable}
      className="group flex w-full min-w-0 items-center gap-1.5 rounded py-0.5 text-left text-[12px] leading-[18px] text-fg-tertiary enabled:hover:text-fg-secondary disabled:cursor-default"
    >
      <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden="true">
        {icon}
      </span>
      <span
        role={live ? "status" : undefined}
        className={`shrink-0 whitespace-nowrap ${live ? "font-semibold text-fg-secondary motion-safe:animate-pulse" : ""}`}
      >
        {label}
      </span>
      {preview && <span className="min-w-0 flex-1 truncate text-fg-faint">{preview}</span>}
      {expandable && (
        <ChevronRight
          size={13}
          className={`ml-auto shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/** 開いた中身。左に細い線を引き、行の下に字下げして置く */
function TraceBody({ children, follow }: { children: React.ReactNode; follow?: unknown }) {
  // 考えているあいだは末尾に追従する。上へ戻して読んでいるときは引き戻さない
  const ref = useScrollToBottom<HTMLDivElement>(follow, 1);
  return (
    <div
      ref={ref}
      className="mb-1 ml-[7px] max-h-56 overflow-y-auto border-l border-border-primary pl-3 text-[11.5px] leading-[18px] text-fg-tertiary motion-safe:animate-fade-in"
    >
      {children}
    </div>
  );
}

function ThinkingRow({ item, live }: { item: Extract<TraceItem, { kind: "thinking" }>; live: boolean }) {
  const [open, setOpen] = useState(false);
  const text = item.text.trim();
  if (!text) return null;
  // 考え終えたときに入る時刻で数える(考えているあいだは秒数を出さない)
  const seconds = Math.max(1, Math.round(((item.endedAt ?? item.startedAt) - item.startedAt) / 1000));
  return (
    <div className="flex flex-col">
      <TraceRow
        icon={<Brain size={13} />}
        label={live ? "考えています" : `${seconds}秒考えました`}
        // 考えているあいだは最新の1行を添える。開いているときは中身で読めるので出さない
        preview={live && !open ? lastLine(text) : undefined}
        live={live}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        expandable
      />
      {open && (
        <TraceBody follow={live ? text : undefined}>
          <p className="whitespace-pre-wrap">{text}</p>
        </TraceBody>
      )}
    </div>
  );
}

function ToolRow({ activity, live }: { activity: AgentActivity; live: boolean }) {
  const [open, setOpen] = useState(false);
  const args = argLines(activity);
  return (
    <div className="flex flex-col">
      <TraceRow
        icon={live ? <Spinner /> : <ToolIcon tool={activity.tool} />}
        label={live ? activity.label : doneLabel(activity)}
        preview={describeArgs(activity) || undefined}
        live={live}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        expandable={args.length > 0}
      />
      {open && (
        <TraceBody>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2">
            {args.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-fg-faint">{key}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </TraceBody>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="size-3 animate-spin rounded-full border-[1.5px] border-fg-faint border-t-fg-secondary motion-reduce:animate-none" />
  );
}

/** 考えている途中の最新の1行(空でない最後の行) */
function lastLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

/** 開いたときに並べる引数。値は読める形にし、空のものは出さない */
function argLines({ args }: AgentActivity): [string, string][] {
  return Object.entries(args).flatMap(([key, value]): [string, string][] => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value) && value.length === 0) return [];
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return [[ARG_LABEL[key] ?? key, text]];
  });
}

const ARG_LABEL: Record<string, string> = {
  keyword: "科目名",
  topic: "内容",
  instructor: "教員",
  day: "曜日",
  period: "時限",
  term: "学期",
  category: "区分",
  subcategory: "分野",
  course_type: "履修区分",
  limit: "件数",
  code: "シラバスコード",
  sections: "読む節",
  mode: "組み方",
  scope: "範囲",
  free_days: "全休の曜日",
  free_day_count: "全休の日数",
  avoid_periods: "避ける時限",
  max_days: "授業のある日の上限",
  max_periods_per_day: "1日のコマ数の上限",
  target_credits: "単位の上限",
  include: "入れる科目",
  exclude: "入れない科目",
};

function ToolIcon({ tool }: { tool: string }) {
  const Icon = tool === "build_timetable" ? CalendarRange : tool === "get_course" ? FileText : Search;
  return <Icon size={13} className="shrink-0" aria-hidden="true" />;
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

const MODE_LABEL: Record<string, string> = {
  rebuild: "組み直す",
  adjust: "今の時間割を直す",
  remove: "外すだけ",
};

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
      return MODE_LABEL[String(value)] ?? "組み直す";
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
