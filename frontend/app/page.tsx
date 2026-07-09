"use client";

import { Bell } from "lucide-react";

const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = [1, 2, 3, 4, 5] as const;

type CourseType = "required" | "elective-required" | "elective" | "free" | null;

type CourseCell = {
  name: string;
  type: CourseType;
} | null;

type Timetable = Record<number, Record<string, CourseCell>>;

const TIMETABLE: Timetable = {
  1: {
    月: { name: "線形代数", type: "required" },
    火: null,
    水: { name: "情報理論", type: "required" },
    木: null,
    金: { name: "英語ⅡA", type: "required" },
  },
  2: {
    月: null,
    火: { name: "アルゴリズム", type: "elective-required" },
    水: { name: "データ構造", type: "elective-required" },
    木: { name: "統計学", type: "elective-required" },
    金: null,
  },
  3: {
    月: { name: "機械学習基礎", type: "elective" },
    火: null,
    水: null,
    木: null,
    金: { name: "プロジェクト演習", type: "elective" },
  },
  4: {
    月: null,
    火: { name: "コンピュータ\nビジョン", type: "elective" },
    水: null,
    木: { name: "卒業研究基礎", type: "required" },
    金: null,
  },
  5: {
    月: null,
    火: null,
    水: { name: "自由時間", type: "free" },
    木: null,
    金: null,
  },
};

const TAG_STYLES: Record<NonNullable<CourseType>, { cell: string; tag: string; label: string }> = {
  required: {
    cell: "bg-[#FFE8E9]",
    tag: "bg-[#E60012]",
    label: "必修",
  },
  "elective-required": {
    cell: "bg-[#EAEEf5]",
    tag: "bg-[#1A2B4E]",
    label: "選択必修",
  },
  elective: {
    cell: "bg-[#F3F4F6]",
    tag: "bg-[#6B7280]",
    label: "選択",
  },
  free: {
    cell: "bg-[#F9FAFB]",
    tag: "",
    label: "",
  },
};

export default function CalendarPage() {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-0px)] bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 h-14 bg-white border-b border-[#D1D5DB] shrink-0">
        <span className="text-[#1A2B4E] text-xl font-bold">時間割</span>
        <div className="flex items-center gap-3">
          <span className="text-[#1A2B4E] text-xs">2024年度 後期</span>
          <Bell size={22} className="text-[#1A2B4E]" />
        </div>
      </header>

      {/* CreditBar */}
      <div className="flex items-center justify-around px-5 h-13 bg-white border-b border-[#D1D5DB] shrink-0 py-2">
        {[
          { val: "62", label: "取得済み単位" },
          { val: "18", label: "今期登録単位" },
          { val: "46", label: "卒業残り単位" },
        ].map(({ val, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[#1A2B4E] text-xl font-bold font-mono leading-none">
              {val}
            </span>
            <span className="text-[#6B7280] text-[10px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Timetable */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col">
          {/* DayHeader */}
          <div className="flex bg-[#1A2B4E] shrink-0">
            <div className="w-7 shrink-0" />
            {DAYS.map((d) => (
              <div
                key={d}
                className="flex-1 h-8 flex items-center justify-center"
              >
                <span className="text-white text-[13px] font-semibold">
                  {d}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {PERIODS.map((p) => (
            <div
              key={p}
              className="flex border-b border-[#E5E7EB]"
              style={{ height: 72 }}
            >
              {/* Period label */}
              <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center">
                <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">
                  {p}
                </span>
                <span className="text-[#6B7280] text-[9px]">限</span>
              </div>

              {/* Day cells */}
              {DAYS.map((d) => {
                const cell = TIMETABLE[p]?.[d] ?? null;
                const style = cell?.type ? TAG_STYLES[cell.type] : null;
                return (
                  <div
                    key={d}
                    className={`flex-1 border-r border-[#E5E7EB] last:border-r-0 flex flex-col justify-center gap-0.5 px-1 py-1.5 ${
                      style ? style.cell : "bg-white"
                    }`}
                  >
                    {cell && (
                      <>
                        <span className="text-[#1A2B4E] text-[10px] font-semibold leading-tight whitespace-pre-wrap break-words">
                          {cell.name}
                        </span>
                        {style && style.label && (
                          <span
                            className={`inline-block px-1 py-px rounded-sm text-white text-[8px] ${style.tag}`}
                            style={{ alignSelf: "flex-start" }}
                          >
                            {style.label}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
