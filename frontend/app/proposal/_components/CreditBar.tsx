import { Calendar } from "lucide-react";

export default function CreditBar() {
  return (
    <div className="flex items-center justify-between px-8 h-12 bg-white border-b border-[#D1D5DB] shrink-0">
      <div className="flex items-center gap-8">
        {[
          { val: "62", label: "取得済み単位", color: "text-[#1A2B4E]" },
          { val: "18", label: "今期登録単位", color: "text-[#E60012]" },
          { val: "46", label: "卒業残り単位", color: "text-[#5F6B7A]" },
        ].map(({ val, label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-xl font-bold font-mono ${color}`}>{val}</span>
            <span className="text-[#6B7280] text-xs">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-[#E60012]" />
        <span className="text-[#1A2B4E] text-sm font-semibold">2024年度 後期</span>
      </div>
    </div>
  );
}
