"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Info } from "lucide-react";
import type { RequirementsView, SlotProgress } from "@/lib/requirements";

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 足りない要件枠1つ。バーは修得済み(紺)と今期の時間割で埋まる分(赤)を積む。
 * 不足の単位数は「修得済み+今期 / 必要」から読めるので行を割かず、ツールチップに出す
 */
function SlotRow({ slot }: { slot: SlotProgress }) {
  const earnedPct = Math.min(100, (slot.earned / slot.required) * 100);
  const plannedPct = Math.min(100 - earnedPct, (slot.planned / slot.required) * 100);
  return (
    <div
      className="flex min-w-0 flex-col gap-1"
      title={[slot.name, `あと${fmt(slot.shortfall)}単位`, slot.notes].filter(Boolean).join("\n")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-fg-primary">{slot.name}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-fg-secondary">
          {fmt(slot.earned)}
          {slot.planned > 0 && <span className="font-bold text-accent">+{fmt(slot.planned)}</span>}
          <span className="text-fg-muted"> / {slot.required}</span>
        </span>
      </div>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-surface-soft"
        role="meter"
        aria-label={slot.name}
        aria-valuemin={0}
        aria-valuemax={slot.required}
        aria-valuenow={slot.earned + slot.planned}
      >
        <div className="h-full bg-fg-primary" style={{ width: `${earnedPct}%` }} />
        <div className="h-full bg-accent" style={{ width: `${plannedPct}%` }} />
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
function LegendInfo({ updating }: { updating: boolean }) {
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
function DoneSummary({ slots, updating }: { slots: SlotProgress[]; updating: boolean }) {
  const names = slots.map((s) => s.name).join("・");
  return (
    <div className="flex w-[190px] shrink-0 flex-col gap-1 rounded-md bg-[#ECFDF5] px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-bold text-[#047857]">
        <CircleCheck size={14} className="shrink-0 text-done-tag" aria-hidden="true" />
        取得済み
        <LegendInfo updating={updating} />
      </span>
      <span className="truncate text-[10px] text-[#047857]" title={names}>
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
 * 足し算しない。今期の時間割(提案・登録済み)の分は赤で重ね、時間割が変われば追従する。
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
  const done = view.slots.filter((s) => s.shortfall <= 0);
  const short = view.slots.filter((s) => s.shortfall > 0);
  return (
    /* 計算し直しているあいだは修得済みだけを出しているので、薄くして示す */
    <div
      className={`flex items-center gap-4 transition-opacity ${view.updating ? "opacity-60" : ""}`}
      aria-busy={view.updating}
    >
      {done.length > 0 ? (
        <DoneSummary slots={done} updating={view.updating} />
      ) : (
        <LegendInfo updating={view.updating} />
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
        <span className="text-xs font-semibold text-[#047857]">今期の時間割で、すべての枠が埋まります</span>
      )}
    </div>
  );
}

/**
 * 卒業要件の帯（モバイル。ui-design_phone.pen RequirementsStrip）。PC と同じ判定
 * （`RequirementsView`）を縦2段で出す — 上に充足した枠のまとめ、下に足りない枠の
 * カード（140px 固定幅・横スクロール）。指で送れるのでスクロールの矢印は置かない。
 */
export function MobileRequirementsStrip({ view }: { view: RequirementsView }) {
  if (view.status === "unavailable") return null;
  const frame = "flex flex-col gap-2 border-b border-border-primary bg-surface-primary px-4 pb-3 pt-2.5";
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
  const done = view.slots.filter((s) => s.shortfall <= 0);
  const short = view.slots.filter((s) => s.shortfall > 0);
  return (
    <div className={`${frame} transition-opacity ${view.updating ? "opacity-60" : ""}`} aria-busy={view.updating}>
      {done.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-md bg-[#ECFDF5] px-2.5 py-1.5">
          <CircleCheck size={14} className="shrink-0 text-[#059669]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#047857]">
            取得済み：{done.map((s) => s.name).join("・")}
          </span>
        </p>
      )}
      {short.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {short.map((slot) => {
            const earnedPct = Math.min(100, (slot.earned / slot.required) * 100);
            const plannedPct = Math.min(100 - earnedPct, (slot.planned / slot.required) * 100);
            return (
              <div
                key={slot.key}
                className="flex w-[140px] shrink-0 flex-col gap-[5px] rounded-md border border-[#E5E7EB] bg-surface-primary px-2.5 py-2"
                title={[slot.name, `あと${fmt(slot.shortfall)}単位`, slot.notes].filter(Boolean).join("\n")}
              >
                <span className="truncate text-[10px] font-bold text-fg-primary">{slot.name}</span>
                <div
                  className="flex h-1.5 overflow-hidden rounded-[3px] bg-[#E5E7EB]"
                  role="meter"
                  aria-label={slot.name}
                  aria-valuemin={0}
                  aria-valuemax={slot.required}
                  aria-valuenow={slot.earned + slot.planned}
                >
                  <div className="h-full bg-fg-primary" style={{ width: `${earnedPct}%` }} />
                  <div className="h-full bg-accent" style={{ width: `${plannedPct}%` }} />
                </div>
                <span className="flex items-end gap-[3px] tabular-nums leading-none">
                  <span className="text-[13px] font-bold text-fg-primary">{fmt(slot.earned)}</span>
                  {slot.planned > 0 && (
                    <span className="text-[11px] font-bold text-accent">+{fmt(slot.planned)}</span>
                  )}
                  <span className="text-[11px] text-fg-tertiary">/ {slot.required}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-xs font-semibold text-[#047857]">今期の時間割で、すべての枠が埋まります</span>
      )}
    </div>
  );
}
