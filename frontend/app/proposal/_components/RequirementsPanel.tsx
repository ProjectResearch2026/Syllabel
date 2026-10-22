"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Info } from "lucide-react";
import type { RequirementsView, SlotProgress } from "@/lib/requirements";

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * バーのツールチップ。今期の時間割で埋まる枠は、不足ではなくそう書く。
 * 不足の単位には成績発表待ちの分を含めない(合格が決まっていない)ので、その分は別の行に書く
 */
function slotTitle(slot: SlotProgress): string {
  const rest = slot.shortfall > 0 ? `あと${fmt(slot.shortfall)}単位` : "今期の時間割で埋まります";
  const pending = slot.pending > 0 ? `成績発表待ち ${fmt(slot.pending)}単位（合格すれば算入）` : null;
  return [slot.name, rest, pending, slot.notes].filter(Boolean).join("\n");
}

/**
 * 枠の名前を帯に収まる長さに詰める。公式の区分名(`slot.name`)は「教養教育科目(必修・仏教)」の
 * ように**区別に要る部分が括弧の中にある**ため、末尾を「…」で切ると「教養教育科目(必修…」と
 * なり、どの枠か分からなくなっていた。共通の頭(「科目」「教養教育」)を削り、括弧の中を残す。
 * 公式の区分名はツールチップと読み上げで出す
 */
export function shortSlotName(name: string): string {
  return name
    .replace(/^教養教育科目/, "教養")
    .replace(/^(専門基礎|専門応用|専門関連)科目/, "$1")
    .replace("選択必修〈基幹〉・", "基幹・");
}

/** バーの幅。修得済み(紺)・成績発表待ち(薄い紺)・今期(赤)の順に積み、100% で打ち切る */
function barWidths(slot: SlotProgress) {
  const earned = Math.min(100, (slot.earned / slot.required) * 100);
  const pending = Math.min(100 - earned, (slot.pending / slot.required) * 100);
  const planned = Math.min(100 - earned - pending, (slot.planned / slot.required) * 100);
  return { earned, pending, planned };
}

/**
 * バーの伸び縮み。今期の時間割が変わると赤(今期)の分が伸び縮みするので、
 * その変化が目で追えるよう幅を動かす
 */
const BAR_MOTION = "transition-[width] duration-500 ease-out motion-reduce:transition-none";

/**
 * バーの地(PC・モバイル共通)。枠線を付けて、何も積まれていない枠(0 / 31)でも
 * バーの長さ=必要単位が見えるようにする。地の色だけでは白いカードに溶けて見えなかった
 */
const BAR_TRACK = "flex h-2 min-w-0 flex-1 overflow-hidden rounded-full border border-fg-muted bg-surface-primary";

/**
 * 足りない要件枠1つ。バーは修得済み(紺)・成績発表待ち(薄い紺)・今期の時間割で埋まる分(赤)を積む。
 * 不足の単位数は「修得済み+今期 / 必要」から読めるので行を割かず、ツールチップに出す
 */
function SlotRow({ slot }: { slot: SlotProgress }) {
  const pct = barWidths(slot);
  return (
    <div
      className="flex min-w-0 flex-col gap-1"
      title={slotTitle(slot)}
    >
      {/* 名前に1行を与える(単位数と並べると名前に残る幅が半分ほどになり、短くしても切れる) */}
      <span className="truncate text-[11px] font-semibold text-fg-primary">{shortSlotName(slot.name)}</span>
      <div className="flex items-center gap-2">
        <div
          className={BAR_TRACK}
          role="meter"
          aria-label={slot.name}
          aria-valuemin={0}
          aria-valuemax={slot.required}
          aria-valuenow={slot.earned + slot.planned}
        >
          <div className={`h-full bg-fg-primary ${BAR_MOTION}`} style={{ width: `${pct.earned}%` }} />
          <div className={`h-full bg-pending ${BAR_MOTION}`} style={{ width: `${pct.pending}%` }} />
          <div className={`h-full bg-accent ${BAR_MOTION}`} style={{ width: `${pct.planned}%` }} />
        </div>
        <span className="shrink-0 tabular-nums text-[11px] leading-none text-fg-secondary">
          {fmt(slot.earned)}
          {slot.pending > 0 && <span className="font-bold text-pending-fg">+{fmt(slot.pending)}</span>}
          {slot.planned > 0 && <span className="font-bold text-accent">+{fmt(slot.planned)}</span>}
          <span className="text-fg-muted"> / {slot.required}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * 足りない枠の横スクロール。スクロールバーは出さず、続きのある側の端をぼかして
 * 矢印ボタンを置く(押すと見えている幅ぶん送る)。トラックパッド・Shift+ホイールでも動く。
 */
function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdge({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrow =
    "absolute top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border-primary bg-surface-primary text-fg-secondary shadow-sm transition-colors hover:text-fg-primary";
  return (
    <div className="relative min-w-0 flex-1">
      <div ref={ref} className="flex gap-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {edge.left && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface-primary to-transparent" />
          <button type="button" aria-label="前の枠を見る" onClick={() => scrollBy(-1)} className={`${arrow} left-0`}>
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
        </>
      )}
      {edge.right && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface-primary to-transparent" />
          <button type="button" aria-label="続きの枠を見る" onClick={() => scrollBy(1)} className={`${arrow} right-0`}>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * バーの凡例。帯を1行に保つため常には出さず、ⓘ に乗せる・フォーカスしたときだけ開く。
 * 数値の「+4」はバーの赤と同じ色なので、凡例を開かなくても読める
 */
function LegendInfo({ updating, pending }: { updating: boolean; pending: boolean }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label="バーの見方" className="text-fg-muted transition-colors hover:text-fg-primary">
        <Info size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="invisible absolute left-0 top-full z-20 mt-1.5 flex w-max flex-col gap-1 rounded-md border border-border-primary bg-surface-primary px-3 py-2 text-[10px] font-normal text-fg-secondary shadow-md group-focus-within:visible group-hover:visible"
      >
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-fg-primary" aria-hidden="true" />
          修得済み
        </span>
        {pending && (
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-pending" aria-hidden="true" />
            成績発表待ち
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          今期で埋まる分
        </span>
        {updating && <span className="text-fg-muted">時間割に合わせて計算し直しています…</span>}
      </span>
    </span>
  );
}

/** 充足した枠のまとめ。枠ごとのバーは出さず、名前だけを1つに畳む */
function DoneSummary({
  slots,
  updating,
  pending,
}: {
  slots: SlotProgress[];
  updating: boolean;
  pending: boolean;
}) {
  const names = slots.map((s) => shortSlotName(s.name)).join("・");
  return (
    <div className="flex w-[250px] shrink-0 flex-col gap-1 rounded-md bg-[#ECFDF5] px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-[#047857]">
        <CircleCheck size={14} className="shrink-0 text-done-tag" aria-hidden="true" />
        取得済み
        <LegendInfo updating={updating} pending={pending} />
      </span>
      {/* 1行で切ると2つ目以降の枠が読めないので、2行まで折り返す */}
      <span className="line-clamp-2 text-[10px] leading-snug text-[#047857]" title={slots.map((s) => s.name).join("\n")}>
        {names}
      </span>
    </div>
  );
}

/**
 * 卒業要件枠ごとの充足状況(design.md §8.3.5)。卒業要件の帯(`CreditBar`)に出す。
 *
 * **足りない枠だけを並べ、充足した枠は1つのまとめに畳む。** すべての枠を出すと帯が
 * 何段にもなり、時間割が低くなって読みにくかった(ui-design_pc.pen 案C)。足りない枠が
 * 1行に入りきらないときは横にスクロールさせる(折り返さない。枠名を読めなくなるまで詰めない)。
 * 凡例も行を割かず ⓘ に畳む。
 *
 * 数字は `POST /api/requirements` の判定(`lib/requirements.ts`)であり、手元で
 * 足し算しない。今期の時間割(提案の科目)の分は赤で重ね、時間割が変われば追従する。
 */
export default function RequirementsPanel({ view }: { view: RequirementsView }) {
  if (view.status === "unavailable") return null;
  if (view.status !== "ready") {
    return (
      <p className="text-[11px] text-fg-muted">
        {view.status === "loading"
          ? "卒業要件の充足状況を計算しています…"
          : "卒業要件の充足状況を取得できませんでした。"}
      </p>
    );
  }
  const done = view.slots.filter((s) => s.earnedShortfall <= 0);
  const short = view.slots.filter((s) => s.earnedShortfall > 0);
  return (
    /* 計算し直しているあいだは修得済みだけを出しているので、薄くして示す */
    <div
      className={`flex items-center gap-4 transition-opacity ${view.updating ? "opacity-60" : ""}`}
      aria-busy={view.updating}
    >
      {done.length > 0 ? (
        <DoneSummary slots={done} updating={view.updating} pending={view.pendingCredits > 0} />
      ) : (
        <LegendInfo updating={view.updating} pending={view.pendingCredits > 0} />
      )}
      {/*
        枠名(公式の区分名)が読める幅を保ち、入りきらない分は横にスクロールさせる。
        折り返すと帯が高くなり、時間割に回す高さが減る
      */}
      {short.length > 0 ? (
        <ScrollRow>
          {short.map((slot) => (
            <div key={slot.key} className="w-[140px] shrink-0">
              <SlotRow slot={slot} />
            </div>
          ))}
        </ScrollRow>
      ) : (
        <span className="text-xs font-semibold text-[#047857]">すべての枠を修得済みです</span>
      )}
    </div>
  );
}

/**
 * 卒業要件の帯（モバイル。ui-design_phone.pen RequirementsStrip）。PC と同じ判定
 * （`RequirementsView`）を**横1列に詰めて**出す — 先頭に充足した枠の件数のチップ、
 * 続けて足りない枠のカード（横スクロール。指で送れるので矢印は置かない）。
 *
 * 時間割を大きく見せるため、帯は1列に収める。以前は充足した枠の名前を並べた行
 * （最大2行）とカード（名前・バー・単位の3段）の2段組みで、時間割の高さを削っていた。
 * 充足した枠の名前はチップを押すと開く。
 */
export function MobileRequirementsStrip({ view }: { view: RequirementsView }) {
  const [doneOpen, setDoneOpen] = useState(false);
  if (view.status === "unavailable") return null;
  const frame = "flex flex-col gap-1.5 border-b border-border-primary bg-surface-primary px-4 py-2";
  if (view.status !== "ready") {
    return (
      <div className={frame}>
        <p className="text-[11px] text-fg-muted">
          {view.status === "loading"
            ? "卒業要件の充足状況を計算しています…"
            : "卒業要件の充足状況を取得できませんでした。"}
        </p>
      </div>
    );
  }
  const done = view.slots.filter((s) => s.earnedShortfall <= 0);
  const short = view.slots.filter((s) => s.earnedShortfall > 0);
  return (
    <div className={`${frame} transition-opacity ${view.updating ? "opacity-60" : ""}`} aria-busy={view.updating}>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {done.length > 0 && (
          <button
            type="button"
            onClick={() => setDoneOpen((v) => !v)}
            aria-expanded={doneOpen}
            className="flex shrink-0 flex-col items-start justify-center gap-0.5 rounded-md bg-[#ECFDF5] px-2.5 py-1.5"
          >
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#047857]">
              <CircleCheck size={12} className="shrink-0 text-[#059669]" aria-hidden="true" />
              取得済み
            </span>
            <span className="text-[11px] font-bold leading-none text-[#047857] tabular-nums">
              {done.length}枠 {doneOpen ? "▴" : "▾"}
            </span>
          </button>
        )}
        {short.length > 0 ? (
          short.map((slot) => {
            const pct = barWidths(slot);
            return (
              <div
                key={slot.key}
                className="flex w-[128px] shrink-0 flex-col justify-center gap-1 rounded-md border border-[#E5E7EB] bg-surface-primary px-2 py-1.5"
                title={slotTitle(slot)}
              >
                <span className="truncate text-[10px] font-bold leading-tight text-fg-primary">
                  {shortSlotName(slot.name)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className={BAR_TRACK}
                    role="meter"
                    aria-label={slot.name}
                    aria-valuemin={0}
                    aria-valuemax={slot.required}
                    aria-valuenow={slot.earned + slot.planned}
                  >
                    <span className={`h-full bg-fg-primary ${BAR_MOTION}`} style={{ width: `${pct.earned}%` }} />
                    <span className={`h-full bg-pending ${BAR_MOTION}`} style={{ width: `${pct.pending}%` }} />
                    <span className={`h-full bg-accent ${BAR_MOTION}`} style={{ width: `${pct.planned}%` }} />
                  </span>
                  <span className="shrink-0 text-[10px] leading-none tabular-nums text-fg-tertiary">
                    <span className="font-bold text-fg-primary">{fmt(slot.earned)}</span>
                    {slot.pending > 0 && <span className="font-bold text-pending-fg">+{fmt(slot.pending)}</span>}
                    {slot.planned > 0 && <span className="font-bold text-accent">+{fmt(slot.planned)}</span>}/
                    {slot.required}
                  </span>
                </span>
              </div>
            );
          })
        ) : (
          <span className="self-center text-xs font-semibold text-[#047857]">すべての枠を修得済みです</span>
        )}
      </div>
      {doneOpen && (
        <p className="rounded-md bg-[#ECFDF5] px-2.5 py-1.5 text-[11px] font-bold leading-snug text-[#047857]">
          {done.map((s) => shortSlotName(s.name)).join("・")}
        </p>
      )}
      {/* 指ではツールチップを開けないので、成績発表待ちがあるときだけ色の意味を1行で添える */}
      {view.pendingCredits > 0 && (
        <p className="flex items-center gap-1.5 text-[10px] leading-none text-fg-secondary">
          <span className="size-2 shrink-0 rounded-full bg-pending" aria-hidden="true" />
          成績発表待ち {fmt(view.pendingCredits)}単位（合格すれば算入）
        </p>
      )}
    </div>
  );
}
