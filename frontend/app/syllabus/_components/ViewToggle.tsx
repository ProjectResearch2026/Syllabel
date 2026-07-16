"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LayoutList, LayoutGrid } from "lucide-react";

export default function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const view = searchParams.get("view") ?? "list";

  const setView = (v: "list" | "grid") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", v);
    params.delete("offset");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center gap-1 bg-[#F3F4F6] rounded-lg p-0.5">
      <button
        onClick={() => setView("list")}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          view === "list"
            ? "bg-white text-[#1A2B4E] shadow-sm"
            : "text-[#9CA3AF] hover:text-[#6B7280]"
        }`}
        aria-label="リスト表示"
      >
        <LayoutList size={15} />
      </button>
      <button
        onClick={() => setView("grid")}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          view === "grid"
            ? "bg-white text-[#1A2B4E] shadow-sm"
            : "text-[#9CA3AF] hover:text-[#6B7280]"
        }`}
        aria-label="グリッド表示"
      >
        <LayoutGrid size={15} />
      </button>
    </div>
  );
}
