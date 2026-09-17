export default function SyllabusDetailLoading() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

      {/* デスクトップ（ui-design_pc.pen 06_講義詳細 の骨格に合わせる） */}
      <div className="hidden min-h-0 min-w-0 flex-1 gap-4 md:flex">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
          <div className="h-5 w-40 animate-pulse rounded bg-[#E5E7EB]" />

          {/* HeroCard skeleton */}
          <div className="flex flex-col gap-4 rounded-xl border border-border-primary bg-surface-primary p-6">
            <div className="flex gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-5 w-16 animate-pulse rounded-md bg-[#E5E7EB]" />
              ))}
            </div>
            <div className="h-8 w-1/2 animate-pulse rounded bg-[#E5E7EB]" />
            <div className="flex gap-5 border-t border-card-divider pt-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-1 flex-col gap-1">
                  <div className="h-3 w-16 animate-pulse rounded bg-[#E5E7EB]" />
                  <div className="h-4 w-20 animate-pulse rounded bg-[#E5E7EB]" />
                </div>
              ))}
            </div>
          </div>

          {/* TabBar skeleton */}
          <div className="flex gap-1 border-b border-card-divider">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="mx-3.5 my-2.5 h-4 w-20 animate-pulse rounded bg-[#E5E7EB]" />
            ))}
          </div>

          <div className="flex flex-col gap-6 rounded-xl border border-border-primary bg-surface-primary p-7">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2.5">
                <div className="h-4 w-24 animate-pulse rounded bg-[#E5E7EB]" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#E5E7EB]" />
              </div>
            ))}
          </div>
        </div>

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
  );
}
