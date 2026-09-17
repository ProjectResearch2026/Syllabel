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

      {/* デスクトップ（ui-design_pc.pen 04_履修提案 の骨格に合わせる） */}
      <div className="hidden min-h-0 flex-1 flex-col gap-2 md:flex">
        {/* CreditBar skeleton。ヘッダーカードの続きとして貼り付く */}
        <div className="flex h-12 shrink-0 items-center gap-8 rounded-b-lg bg-surface-primary px-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="h-7 w-10 animate-pulse rounded bg-[#E5E7EB]" />
              <div className="h-3 w-16 animate-pulse rounded bg-[#E5E7EB]" />
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Timetable skeleton */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
            <div className="flex h-10 shrink-0 border-b border-border-primary bg-surface-gray">
              <div className="w-11 shrink-0" />
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex-1 border-l border-border-primary" />
              ))}
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex min-h-0 flex-1 border-b border-border-primary last:border-b-0">
                <div className="w-11 shrink-0 border-r border-border-primary bg-cell-free" />
                {[...Array(6)].map((_, j) => (
                  <div
                    key={j}
                    className="flex flex-1 items-center justify-center border-r border-border-primary p-2 last:border-r-0"
                  >
                    <div className="h-4 w-full animate-pulse rounded bg-[#E5E7EB]" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ChatPanel skeleton */}
          <aside className="flex w-[344px] shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
            <div className="flex h-[52px] shrink-0 items-center gap-2.5 bg-surface-gray px-4">
              <div className="size-[30px] shrink-0 animate-pulse rounded-full bg-[#E5E7EB]" />
              <div className="h-3 w-28 animate-pulse rounded bg-[#E5E7EB]" />
            </div>
            <div className="flex-1 bg-surface-gray p-4">
              <div className="h-16 w-3/4 animate-pulse rounded-[2px_12px_12px_12px] bg-surface-primary" />
            </div>
            <div className="shrink-0 bg-surface-gray p-3">
              <div className="h-16 animate-pulse rounded-full bg-surface-primary" />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
