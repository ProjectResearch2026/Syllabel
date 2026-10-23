"use client";

import { useEffect, useState } from "react";
import { Brain, CalendarRange, ChevronRight, FileText, Search } from "lucide-react";
import type { AgentActivity } from "@/lib/chatApi";
import type { TraceItem } from "@/lib/chat";
import { useProposalStore } from "@/lib/proposal";
import { useScrollToBottom } from "@/lib/useScrollToBottom";

/**
 * AI が考えている様子（design.md §8.3.7）。吹き出しの本文の上に、届いた順に1行ずつ出す。
 * Claude Code の会話の出し方にならう。
 *
 * - **思考**は1行に畳み、押すと全文を開く。考えているあいだは「○秒考えています」(秒数は
 *   数え上げる)と最新の1行を、終わったら「○秒考えました」を出す。開いた全文は枠の中で
 *   スクロールでき、考えているあいだは末尾に追従する(上へ戻して読んでいるときは引き戻さない)。
 *   **全文はいつでも開ける** — 末尾だけを流していた頃は、流れて消えた分を読めなかった
 * - **ツールの呼び出し**も1行で、呼んでいるあいだは backend が決めた文言(「シラバスを
 *   検索しています」)、終わったら「〜しました」にし、モデルが書いた引数を短く添える。押すと
 *   引数を「時間割から外す: 水環境科学, 経済学のすすめ」のように1行ずつの文で開く(引数名や
 *   remove のような値をそのまま出さない)
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
  const now = useNow(live);
  const text = item.text.trim();
  if (!text) return null;
  // 考え終えたら終えた時刻で、考えているあいだは今の時刻で数える
  const seconds = Math.max(1, Math.round(((item.endedAt ?? now) - item.startedAt) / 1000));
  return (
    <div className="flex flex-col">
      <TraceRow
        icon={<Brain size={13} />}
        label={live ? `${seconds}秒考えています` : `${seconds}秒考えました`}
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

/** `active` のあいだ1秒ごとに進む今の時刻 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function ToolRow({ activity, live }: { activity: AgentActivity; live: boolean }) {
  const [open, setOpen] = useState(false);
  const courses = useProposalStore((s) => s.courses);
  // シラバスコードは時間割にある科目なら科目名に直す。無ければコードのまま
  const titleOf = (code: string) => courses.find((c) => c.syllabusCode === code)?.title ?? code;
  const lines = argLines(activity, titleOf);
  return (
    <div className="flex flex-col">
      <TraceRow
        icon={live ? <Spinner /> : <ToolIcon tool={activity.tool} />}
        label={live ? activity.label : doneLabel(activity)}
        preview={describeArgs(activity) || undefined}
        live={live}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        expandable={lines.length > 0}
      />
      {open && (
        <TraceBody>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
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

/** 開いたときに並べる行。引数を「見出し: 値」の文にし、学生に関係の無い引数は出さない */
function argLines({ tool, args }: AgentActivity, titleOf: (code: string) => string): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined || value === "") continue;
    const line =
      tool === "build_timetable"
        ? buildLine(key, value, args, titleOf)
        : tool === "get_course"
          ? courseLine(key, value, titleOf)
          : searchLine(key, value, args);
    if (line) lines.push(line);
  }
  return lines;
}

/** 配列は「, 」でつなぐ */
function joined(value: unknown, map: (v: string) => string = (v) => v): string {
  return Array.isArray(value) ? value.map((v) => map(String(v))).join(", ") : map(String(value));
}

/** 指定をやめたこと([] / 0)を表す値か */
function cleared(value: unknown): boolean {
  return (Array.isArray(value) && value.length === 0) || value === 0;
}

const BUILD_MODE_LINE: Record<string, string> = {
  rebuild: "時間割を組み直す（自分で入れた科目は残す）",
  adjust: "今の時間割を直す（条件に合わない科目を外し、空いたコマを埋める）",
  remove: "条件に合わない科目を外すだけ（空いたコマは埋めない）",
};

const SCOPE_LINE: Record<string, string> = {
  必修のみ: "必修だけを入れる",
  不足を埋める: "卒業要件の不足を埋める",
  広く: "不足を埋めた後も、登録できる単位まで入れる",
};

/** 「1限」は全曜日の1限、「金5」は金曜5限 */
function periodText(v: string): string {
  const m = v.match(/^([月火水木金土])(\d)$/);
  if (m) return `${m[1]}曜${m[2]}限`;
  return /^\d限$/.test(v) ? `毎日${v}` : v;
}

function buildLine(
  key: string,
  value: unknown,
  args: Record<string, unknown>,
  titleOf: (code: string) => string,
): string | null {
  const off = cleared(value);
  switch (key) {
    case "mode":
      // 外す科目を挙げていれば「時間割から外す: …」の行で足りる
      if (value === "remove" && Array.isArray(args.exclude) && args.exclude.length > 0) return null;
      return BUILD_MODE_LINE[String(value)] ?? `組み方: ${value}`;
    case "scope":
      return SCOPE_LINE[String(value)] ?? `範囲: ${value}`;
    case "free_days":
      return off ? "全休の曜日の指定をやめる" : `全休にする曜日: ${joined(value, (d) => `${d}曜`)}`;
    case "free_day_count":
      return off ? "全休の希望をやめる" : `全休にする日数: ${value}日`;
    case "avoid_periods":
      return off ? "避ける時限の指定をやめる" : `避ける時限: ${joined(value, periodText)}`;
    case "max_days":
      return off ? "授業のある日の上限をなくす" : `授業のある日: 週${value}日まで`;
    case "max_periods_per_day":
      return `1日のコマ数: ${value}コマまで`;
    case "target_credits":
      return off ? "単位の上限をなくす" : `単位の上限: ${value}単位`;
    case "include":
      return off ? "入れる科目の指定をやめる" : `時間割に入れる: ${joined(value, titleOf)}`;
    case "exclude":
      if (off) return "入れない科目の指定をやめる";
      return `${args.mode === "remove" ? "時間割から外す" : "時間割に入れない"}: ${joined(value, titleOf)}`;
    default:
      return otherLine(key, value);
  }
}

function searchLine(key: string, value: unknown, args: Record<string, unknown>): string | null {
  if (cleared(value) && key !== "period") return null;
  switch (key) {
    case "keyword":
      return `科目名: ${value}`;
    case "topic": {
      const text = String(value);
      return /[、,]/.test(text) ? `内容: ${text}（どれかを含む）` : `内容: ${text}`;
    }
    case "instructor":
      return `教員: ${value}`;
    case "day":
      return args.period ? `曜日・時限: ${value}曜${args.period}限` : `曜日: ${value}曜`;
    case "period":
      return args.day ? null : `時限: ${value}限`;
    case "term":
      return `学期: ${value}`;
    case "category":
      return `区分: ${value}`;
    case "subcategory":
      return `分野: ${value}`;
    case "course_type":
      return `履修区分: ${value}`;
    // 既定(履修登録できる科目だけ・修得済みを除く)のときは出さない
    case "only_registrable":
      return value === false ? "履修登録できない科目も含める" : null;
    case "include_taken":
      return value === true ? "修得済みの科目も含める" : null;
    case "limit":
      return null;
    default:
      return otherLine(key, value);
  }
}

function courseLine(key: string, value: unknown, titleOf: (code: string) => string): string | null {
  switch (key) {
    case "code": {
      const title = titleOf(String(value));
      return title === value ? `シラバスコード: ${value}` : `科目: ${title}`;
    }
    case "sections":
      return cleared(value) ? null : `読んだ項目: ${joined(value)}`;
    default:
      return otherLine(key, value);
  }
}

/** 知らない引数は値だけを読める形にして出す */
function otherLine(key: string, value: unknown): string | null {
  if (cleared(value)) return null;
  const text = typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : joined(value);
  return `${key}: ${text}`;
}

function ToolIcon({ tool }: { tool: string }) {
  const Icon = tool === "build_timetable" ? CalendarRange : tool === "get_course" ? FileText : Search;
  return <Icon size={13} className="shrink-0" aria-hidden="true" />;
}

/** 終わった呼び出しの文言。「〜しています」を「〜しました」に寄せる */
function doneLabel(activity: AgentActivity): string {
  switch (activity.tool) {
    case "build_timetable":
      return "時間割を組みました";
    case "search_courses":
      return "シラバスを検索しました";
    case "get_course":
      return "シラバスを読みました";
    default:
      return "調べました";
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
