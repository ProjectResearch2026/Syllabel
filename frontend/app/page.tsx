"use client";

import { ShieldCheck, Lock, WifiOff, Trash2, Upload, Play, Bell } from "lucide-react";

/* ── モバイル: 時間割ページ ─────────────────────────────────── */
const DAYS = ["月", "火", "水", "木", "金"] as const;
const PERIODS = [1, 2, 3, 4, 5] as const;

type CourseType = "required" | "elective" | null;
type CourseCell = { name: string; type: CourseType } | null;
type Timetable = Record<number, Record<string, CourseCell>>;

const TIMETABLE: Timetable = {
  1: {
    月: { name: "線形代数", type: "required" },
    火: null,
    水: { name: "情報理論", type: "required" },
    木: null,
    金: { name: "微分方程式", type: "elective" },
  },
  2: {
    月: null,
    火: { name: "OS論", type: "required" },
    水: null,
    木: { name: "アルゴリズム", type: "required" },
    金: null,
  },
  3: {
    月: { name: "データベース", type: "elective" },
    火: null,
    水: null,
    木: null,
    金: { name: "確率統計", type: "required" },
  },
  4: {
    月: null,
    火: { name: "ソフトウェア工学", type: "elective" },
    水: null,
    木: { name: "機械学習", type: "elective" },
    金: null,
  },
  5: {
    月: null,
    火: null,
    水: null,
    木: null,
    金: null,
  },
};

const TAG_STYLES: Record<NonNullable<CourseType>, { cell: string; tag: string; label: string }> = {
  required: { cell: "bg-[#FFE8E9]", tag: "bg-[#E60012]", label: "必修" },
  elective: { cell: "bg-[#E8F0FF]", tag: "bg-[#1A2B4E]", label: "選択" },
};

function MobileTimetablePage() {
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
      <div className="flex items-center justify-around px-5 bg-white border-b border-[#D1D5DB] shrink-0 py-2">
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
              <div key={d} className="flex-1 h-8 flex items-center justify-center">
                <span className="text-white text-[13px] font-semibold">{d}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {PERIODS.map((p) => (
            <div key={p} className="flex border-b border-[#E5E7EB]" style={{ height: 72 }}>
              <div className="w-7 shrink-0 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col items-center justify-center">
                <span className="text-[#1A2B4E] text-[13px] font-bold font-mono leading-none">{p}</span>
                <span className="text-[#9CA3AF] text-[9px]">限</span>
              </div>
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
                        <span className="text-[#1A2B4E] text-[10px] font-semibold leading-tight break-words">
                          {cell.name}
                        </span>
                        {style && (
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

/* ── PC: 成績インポートページ (04_ImportPage) ────────────────── */
function PcImportPage() {
  return (
    <div className="flex flex-1 min-h-[calc(100vh-60px)]">
      {/* Left Panel */}
      <div className="w-[480px] shrink-0 bg-[#1A2B4E] flex flex-col items-center justify-center gap-8 px-[60px] py-[60px]">
        {/* Intro */}
        <div className="flex flex-col items-center gap-5">
          <ShieldCheck size={64} className="text-white" />
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-white text-[22px] font-bold text-center w-[320px]">
              安心のプライバシー設計
            </h2>
            <p className="text-[#93A8C4] text-sm text-center leading-[1.7] w-[320px]">
              成績表はブラウザ上でのみ処理されます。外部のAIサービスには送信されず、ページを閉じると即時に消去されます。
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="flex flex-col gap-4 w-full">
          {[
            { icon: Lock, label: "学内サーバーのみで処理" },
            { icon: WifiOff, label: "外部AI不使用" },
            { icon: Trash2, label: "閉じると即時消去" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon size={16} className="text-[#93A8C4] shrink-0" />
              <span className="text-[#D1D5DB] text-[13px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-[#F8F9FA] flex flex-col items-center justify-center gap-8 px-[80px] py-[48px]">
        {/* Step bar */}
        <div className="flex items-center w-[480px]">
          <StepItem num={1} label="アップロード" active />
          <div className="w-[60px] h-px bg-[#D1D5DB]" />
          <StepItem num={2} label="確認" active={false} />
          <div className="w-[60px] h-px bg-[#D1D5DB]" />
          <StepItem num={3} label="完了" active={false} />
        </div>

        {/* Form card */}
        <div className="w-[480px] bg-white rounded-xl border border-[#E5E7EB] p-8 flex flex-col gap-6">
          {/* Upload section title */}
          <div>
            <h3 className="text-[#1A2B4E] text-base font-bold">成績表PDFを選択</h3>
          </div>

          {/* Upload zone */}
          <div className="w-full h-[160px] bg-[#FAFAFA] rounded-lg border border-[#D1D5DB] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#1A2B4E] transition-colors">
            <div className="w-12 h-12 rounded-full bg-[#1A2B4E] flex items-center justify-center">
              <Upload size={22} className="text-white" />
            </div>
            <p className="text-[#1A2B4E] text-sm font-semibold text-center w-[360px]">
              PDFファイルをクリックして選択 またはドラッグ&ドロップ
            </p>
            <p className="text-[#6B7280] text-xs text-center w-[360px]">
              龍谷大学ポータルからダウンロードした成績表PDF
            </p>
          </div>

          {/* OR separator */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E5E7EB]" />
            <span className="text-[#9CA3AF] text-xs">または</span>
            <div className="flex-1 h-px bg-[#E5E7EB]" />
          </div>

          {/* Demo button */}
          <button className="w-full h-11 rounded-lg border border-[#1A2B4E] flex items-center justify-center gap-2 hover:bg-[#EEF1F8] transition-colors">
            <Play size={16} className="text-[#1A2B4E]" />
            <span className="text-[#1A2B4E] text-sm font-semibold">
              ダミーデータで試す（展示用）
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StepItem({ num, label, active }: { num: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
          active ? "bg-[#1A2B4E]" : "bg-[#E5E7EB]"
        }`}
      >
        <span
          className={`text-xs font-bold ${active ? "text-white" : "text-[#9CA3AF]"}`}
        >
          {num}
        </span>
      </div>
      <span
        className={`text-[13px] font-semibold ${
          active ? "text-[#1A2B4E]" : "text-[#9CA3AF]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ── Root page: モバイル/PC 切り替え ────────────────────────── */
export default function RootPage() {
  return (
    <>
      {/* モバイルのみ表示 */}
      <div className="md:hidden">
        <MobileTimetablePage />
      </div>
      {/* PCのみ表示 */}
      <div className="hidden md:flex flex-col flex-1">
        <PcImportPage />
      </div>
    </>
  );
}
