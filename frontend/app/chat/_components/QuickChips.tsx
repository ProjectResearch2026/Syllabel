const QUICK_CHIPS = ["必修を確認", "空きコマを埋めたい", "単位数の相談"];

export default function QuickChips({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="flex gap-2 px-4 py-2 bg-[#F8F9FA] overflow-x-auto shrink-0">
      {QUICK_CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => onSend(chip)}
          className="shrink-0 px-3 py-1.5 bg-white border border-[#D1D5DB] rounded-full text-[#1A2B4E] text-xs whitespace-nowrap hover:bg-[#F8F9FA] transition-colors"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
