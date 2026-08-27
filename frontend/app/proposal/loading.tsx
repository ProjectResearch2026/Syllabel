export default function ProposalLoading() {
  return (
    <>
      {/* モバイル */}
      <div className="md:hidden flex flex-col h-[calc(100dvh-96px)] bg-[#F8F9FA]">
        {/* CreditBar skeleton */}
        <div className="flex items-center justify-around px-5 bg-white border-b border-[#D1D5DB] py-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-6 w-10 rounded bg-[#E5E7EB] animate-pulse" />
              <div className="h-2.5 w-16 rounded bg-[#E5E7EB] animate-pulse" />
            </div>
          ))}
        </div>

        {/* Timetable skeleton */}
        <div className="bg-white border-b border-[#D1D5DB] px-3 py-2">
          <div className="flex flex-col gap-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-1 h-12">
                <div className="w-7 rounded bg-[#E5E7EB] animate-pulse shrink-0" />
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="flex-1 rounded bg-[#E5E7EB] animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Chat skeleton */}
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="h-10 w-3/4 rounded-xl bg-[#E5E7EB] animate-pulse self-start" />
        </div>
      </div>

      {/* デスクトップ */}
      <div className="hidden md:flex flex-col flex-1">
        {/* CreditBar skeleton */}
        <div className="flex items-center gap-8 px-8 h-12 bg-white border-b border-[#D1D5DB]">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-7 w-10 rounded bg-[#E5E7EB] animate-pulse" />
              <div className="h-3 w-16 rounded bg-[#E5E7EB] animate-pulse" />
            </div>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Timetable skeleton */}
          <div className="flex-1 bg-[#F8F9FA] px-5 py-4">
            <div className="bg-white rounded-lg border border-[#D1D5DB] overflow-hidden flex flex-col h-full">
              <div className="flex h-10 border-b border-[#D1D5DB]">
                <div className="w-11 shrink-0" />
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex-1 border-l border-[#D1D5DB]" />
                ))}
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex flex-1 border-b border-[#D1D5DB] last:border-b-0">
                  <div className="w-11 shrink-0 bg-[#F9FAFB] border-r border-[#D1D5DB]" />
                  {[...Array(5)].map((_, j) => (
                    <div
                      key={j}
                      className="flex-1 border-r border-[#D1D5DB] last:border-r-0 flex items-center justify-center p-2"
                    >
                      <div className="h-4 w-full rounded bg-[#E5E7EB] animate-pulse" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ChatPanel skeleton */}
          <div className="w-[360px] shrink-0 border-l border-[#D1D5DB] bg-white flex flex-col">
            <div className="h-[52px] border-b border-[#D1D5DB] px-4 flex items-center gap-2.5">
              <div className="w-[30px] h-[30px] rounded-full bg-[#E5E7EB] animate-pulse shrink-0" />
              <div className="flex flex-col gap-1">
                <div className="h-3 w-24 rounded bg-[#E5E7EB] animate-pulse" />
                <div className="h-2.5 w-32 rounded bg-[#E5E7EB] animate-pulse" />
              </div>
            </div>
            <div className="flex-1 px-4 py-4">
              <div className="h-12 w-3/4 rounded-xl bg-[#E5E7EB] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
