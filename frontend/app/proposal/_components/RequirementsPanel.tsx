"use client";

import type { RequirementsView, SlotProgress } from "@/lib/requirements";

/** 0.5 単位の科目があるので、整数でなければ小数1桁で出す */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** 要件枠1つ。バーは修得済み(紺)と今期の時間割で埋まる分(赤)を積む */
function SlotRow({ slot }: { slot: SlotProgress }) {
  const done = slot.shortfall <= 0;
  const earnedPct = Math.min(100, (slot.earned / slot.required) * 100);
  const plannedPct = Math.min(100 - earnedPct, (slot.planned / slot.required) * 100);
  return (
    <div className="flex min-w-0 flex-col gap-1" title={slot.notes ?? undefined}>
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
      <span className={`text-[10px] ${done ? "font-semibold text-done-tag" : "text-fg-muted"}`}>
        {done ? "充足" : `あと${fmt(slot.shortfall)}単位`}
      </span>
    </div>
  );
}

/**
 * 卒業要件枠ごとの充足状況(design.md §8.3.5)。単位バー(`CreditBar`)の下に開く。
 *
 * 数字は `POST /api/requirements` の判定(`lib/requirements.ts`)であり、手元で
 * 足し算しない。今期の時間割(提案・登録済み)の分は赤で重ね、時間割が変われば追従する。
 */
export default function RequirementsPanel({ view }: { view: RequirementsView }) {
  if (view.status === "unavailable") return null;
  if (view.status !== "ready") {
    return (
      <p className="px-8 pb-3 text-[11px] text-fg-muted">
        {view.status === "loading"
          ? "卒業要件の充足状況を計算しています…"
          : "卒業要件の充足状況を取得できませんでした。"}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-8 pb-3">
      <div className="flex items-center gap-4 text-[10px] text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-fg-primary" aria-hidden="true" />
          修得済み
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          今期の時間割で埋まる分
        </span>
        {view.updating && <span>時間割に合わせて計算し直しています…</span>}
      </div>
      <div className="grid grid-cols-4 gap-x-8 gap-y-2.5">
        {view.slots.map((slot) => (
          <SlotRow key={slot.key} slot={slot} />
        ))}
      </div>
    </div>
  );
}
