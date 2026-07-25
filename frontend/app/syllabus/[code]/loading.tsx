export default function SyllabusDetailLoading() {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* モバイル */}
      <div className="md:hidden flex flex-col bg-white min-h-full">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[#D1D5DB]">
          <div className="w-8 h-8 rounded bg-[#E5E7EB] animate-pulse" />
          <div className="h-4 flex-1 max-w-xs rounded bg-[#E5E7EB] animate-pulse" />
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">
          <div className="h-6 w-2/3 rounded bg-[#E5E7EB] animate-pulse" />
          <div className="h-4 w-1/3 rounded bg-[#E5E7EB] animate-pulse" />
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 w-16 rounded-full bg-[#E5E7EB] animate-pulse" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 rounded bg-[#E5E7EB] animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
          ))}
        </div>
      </div>

      {/* デスクトップ */}
      <div className="hidden md:flex flex-1 min-w-0">
        <div className="flex-1 flex flex-col gap-5 px-8 py-6 max-w-2xl">
          <div className="h-7 w-1/2 rounded bg-[#E5E7EB] animate-pulse" />
          <div className="h-4 w-1/4 rounded bg-[#E5E7EB] animate-pulse" />
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-6 w-16 rounded-full bg-[#E5E7EB] animate-pulse" />
            ))}
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-3 w-20 rounded bg-[#E5E7EB] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[#E5E7EB] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="w-[360px] shrink-0 border-l border-[#D1D5DB] bg-white" />
      </div>
    </div>
  );
}
