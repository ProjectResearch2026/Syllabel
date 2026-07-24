import { Fragment } from "react";
import { Check } from "lucide-react";

const STEPS = ["アップロード", "確認", "完了"] as const;

export default function StepBar({ current }: { current: number }) {
  const allDone = current >= STEPS.length - 1;

  return (
    <div className="flex items-center w-[520px]">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={label}>
            <div className="flex items-center gap-2 px-2.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  done || active ? "bg-[#1A2B4E]" : "bg-[#E5E7EB]"
                }`}
              >
                {done ? (
                  <Check size={14} className="text-white" />
                ) : (
                  <span
                    className={`text-xs font-bold ${
                      active ? "text-white" : "text-[#9CA3AF]"
                    }`}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className={`text-[13px] ${
                  active
                    ? "text-[#1A2B4E] font-semibold"
                    : done
                      ? "text-[#1A2B4E]"
                      : "text-[#9CA3AF]"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px ${allDone ? "bg-[#1A2B4E]" : "bg-[#D1D5DB]"}`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
