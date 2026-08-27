import { Fragment } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
              <motion.div
                animate={{ backgroundColor: done || active ? "#1A2B4E" : "#E5E7EB" }}
                transition={{ duration: 0.3 }}
                className="w-7 h-7 rounded-full flex items-center justify-center"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", damping: 20, stiffness: 400 }}
                    >
                      <Check size={14} className="text-white" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="num"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`text-xs font-bold ${active ? "text-white" : "text-[#9CA3AF]"}`}
                    >
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
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
