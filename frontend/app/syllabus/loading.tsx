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

      {/* デスクトップ */}
      <div className="hidden md:flex md:flex-col md:flex-1 min-w-0">
        {/* TopBar skeleton */}
        <div className="flex items-center gap-3 px-6 h-14 bg-white border-b border-[#D1D5DB]">
          <div className="flex-1 max-w-md h-9 rounded-full bg-[#E5E7EB] animate-pulse" />
          <div className="h-9 w-24 rounded-lg bg-[#E5E7EB] animate-pulse" />
        </div>

        <div className="flex flex-1 min-w-0">
          {/* Filters skeleton */}
          <aside className="w-[220px] shrink-0 border-r border-[#D1D5DB] bg-white px-4 py-5 flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="h-3 w-16 rounded bg-[#E5E7EB] animate-pulse" />
                <div className="h-8 rounded-lg bg-[#E5E7EB] animate-pulse" />
              </div>
            ))}
          </aside>

          {/* Cards skeleton */}
          <main className="flex-1 bg-[#F8F9FA] px-6 py-5">
            <div className="h-4 w-24 rounded bg-[#E5E7EB] animate-pulse mb-5" />
            <div className="grid grid-cols-2 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white border border-[#D1D5DB] rounded-lg overflow-hidden flex">
                  <div className="w-1 bg-[#E5E7EB]" />
                  <div className="flex flex-col gap-2 px-3.5 py-3 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="h-3 w-20 rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-5 w-10 rounded-full bg-[#E5E7EB] animate-pulse" />
                    </div>
                    <div className="h-4 w-3/4 rounded bg-[#E5E7EB] animate-pulse" />
                    <div className="flex gap-3">
                      <div className="h-3 w-10 rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-3 w-10 rounded bg-[#E5E7EB] animate-pulse" />
                      <div className="h-3 w-20 rounded bg-[#E5E7EB] animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
