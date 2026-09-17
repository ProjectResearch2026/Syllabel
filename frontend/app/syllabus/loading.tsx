export default function SyllabusLoading() {
  return (
    <>
      {/* モバイル */}
      <div className="md:hidden flex flex-col bg-[#F8F9FA] min-h-full">
        {/* TopBar skeleton */}
        <div className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 bg-white border-b border-[#D1D5DB]">
          <div className="flex-1 h-9 rounded-full bg-[#E5E7EB] animate-pulse" />
          <div className="w-9 h-9 rounded-full bg-[#E5E7EB] animate-pulse shrink-0" />
        </div>

        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-[#D1D5DB] bg-white">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-full bg-[#E5E7EB] animate-pulse shrink-0" />
          ))}
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-[#D1D5DB] p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 rounded bg-[#E5E7EB] animate-pulse" />
                <div className="h-5 w-12 rounded-full bg-[#E5E7EB] animate-pulse" />
              </div>
              <div className="h-4 w-3/4 rounded bg-[#E5E7EB] animate-pulse" />
              <div className="flex gap-3">
                <div className="h-3 w-12 rounded bg-[#E5E7EB] animate-pulse" />
                <div className="h-3 w-12 rounded bg-[#E5E7EB] animate-pulse" />
                <div className="h-3 w-20 rounded bg-[#E5E7EB] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* デスクトップ（ui-design_pc.pen 05_シラバス一覧 の骨格に合わせる） */}
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex">
        {/* SearchBar skeleton。ヘッダーカードの続きとして貼り付く */}
        <div className="flex h-16 shrink-0 items-center gap-4 rounded-b-lg bg-surface-primary px-8">
          <div className="h-10 w-[420px] shrink-0 animate-pulse rounded-full bg-[#E5E7EB]" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-[#E5E7EB]" />
          ))}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 gap-4">
          {/* Filters skeleton */}
          <aside className="flex w-60 shrink-0 flex-col gap-4 self-stretch rounded-lg bg-surface-primary px-4 py-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-3 w-16 animate-pulse rounded bg-[#E5E7EB]" />
                <div className="h-9 animate-pulse rounded bg-[#E5E7EB]" />
              </div>
            ))}
          </aside>

          {/* Cards skeleton */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="h-4 w-40 animate-pulse rounded bg-[#E5E7EB]" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-xl border border-card-border bg-surface-primary p-4"
                >
                  <div className="h-3 w-20 animate-pulse rounded bg-[#E5E7EB]" />
                  <div className="flex gap-1.5">
                    {[...Array(3)].map((__, j) => (
                      <div key={j} className="h-4 w-12 animate-pulse rounded-md bg-[#E5E7EB]" />
                    ))}
                  </div>
                  <div className="h-5 w-3/4 animate-pulse rounded bg-[#E5E7EB]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-[#E5E7EB]" />
                  <div className="mt-1 h-4 animate-pulse rounded bg-[#E5E7EB]" />
                </div>
              ))}
            </div>
          </main>

          {/* ChatPanel skeleton */}
          <aside className="flex w-[344px] shrink-0 flex-col self-stretch overflow-hidden rounded-lg border border-border-primary bg-surface-primary">
            <div className="h-[52px] shrink-0 bg-surface-gray" />
            <div className="flex-1 bg-surface-gray" />
            <div className="shrink-0 bg-surface-gray p-3">
              <div className="h-16 animate-pulse rounded-full bg-surface-primary" />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
