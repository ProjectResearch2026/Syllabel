"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function SyllabusError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16">
      <div className="w-16 h-16 rounded-full bg-[#FEF2F2] flex items-center justify-center">
        <AlertCircle size={32} className="text-[#DC2626]" />
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-base font-bold text-[#1A2B4E]">シラバスの読み込みに失敗しました</h2>
        <p className="text-sm text-[#4B5563] leading-relaxed">
          ネットワークエラーまたはサーバーの問題が発生しました。
          <br />
          しばらく待ってから再試行してください。
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 h-10 px-5 rounded-lg bg-[#1A2B4E] text-white text-sm font-semibold active:bg-[#0f1b30] transition-colors"
      >
        <RefreshCw size={16} />
        再試行
      </button>
    </div>
  );
}
