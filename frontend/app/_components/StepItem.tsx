export default function StepItem({
  num,
  label,
  active,
}: {
  num: number;
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${
          active ? "bg-[#1A2B4E]" : "bg-[#E5E7EB]"
        }`}
      >
        <span className={`text-xs font-bold ${active ? "text-white" : "text-[#9CA3AF]"}`}>
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
