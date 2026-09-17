"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { useChatStore } from "@/lib/chat";

/**
 * 「時間割に追加」（ui-design_pc.pen 06_講義詳細 ActionButton）。
 *
 * **時間割は学生が直接編集するものではない。** 提案はAIが卒業要件から逆算して
 * 組み、組み替えは提案チャットとの対話で行う（§7.2）。ここで勝手にコマを挿すと、
 * 単位数上限やコマ重複の検査を通らない時間割ができてしまう。
 *
 * そこで**この科目を入れてほしいという依頼として提案チャットへ送る**。
 * 押すと時間割画面へ移り、依頼が入力済みの状態で会話が始まる。
 */
export default function AddToTimetableButton({ title }: { title: string }) {
  const router = useRouter();
  const addProposalMessage = useChatStore((s) => s.addProposalMessage);

  const handleClick = () => {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    addProposalMessage({
      id: `proposal-add-${Date.now()}`,
      role: "user",
      content: `「${title}」を時間割に追加できますか？`,
      time,
    });
    router.push("/proposal");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-[18px] py-2.5 transition-colors hover:bg-primary-dark"
    >
      <CalendarPlus size={15} className="text-fg-inverse" aria-hidden="true" />
      <span className="text-[13.5px] font-bold text-fg-inverse">時間割に追加</span>
    </button>
  );
}
