import { CalendarCheck } from "lucide-react";

export default function ContextBanner() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#F8F9FA] border-l-[3px] border-[#E60012] shrink-0">
      <CalendarCheck size={18} className="text-[#E60012] shrink-0" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[#1A2B4E] text-xs font-semibold">時間割データ連携中</span>
        <span className="text-[#6B7280] text-[10px]">
          今期登録18単位・取得済み62単位を参照しています
        </span>
      </div>
    </div>
  );
}
