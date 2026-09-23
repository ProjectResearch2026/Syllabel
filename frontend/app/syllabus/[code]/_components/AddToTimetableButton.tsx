"use client";

import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { useChatStore } from "@/lib/chat";
import { useProposalStore } from "@/lib/proposal";

/**
 * 「時間割に追加」（ui-design_pc.pen 06_講義詳細 ActionButton）。
 *
 * **時間割は学生が直接編集するものではない。** 提案はAIが卒業要件から逆算して
 * 組み、組み替えは提案チャットとの対話で行う（§7.2）。ここで勝手にコマを挿すと、
 * 単位数上限やコマ重複の検査を通らない時間割ができてしまう。
 *
 * そこで**この科目を入れてほしいという依頼として提案チャットへ送る**。
 * 押すと時間割画面へ移り、依頼が入力済みの状態で会話が始まる。
 *
 * **提案の時間割にすでに入っている科目では押させない。** 時間割の科目から詳細を
 * 開いたとき(design.md §8.3.4)に「追加できますか?」と依頼しても意味が無い。
 * 同じ科目の別クラス(コードが違う)は入っていないものとして扱う。
 */
export default function AddToTimetableButton({ title, code }: { title: string; code: string }) {
  const router = useRouter();
  const addProposalMessage = useChatStore((s) => s.addProposalMessage);
  const inProposal = useProposalStore(
    (s) => s.status === "done" && s.courses.some((c) => c.syllabusCode === code),
  );

  if (inProposal) {
    return (
      <span className="flex shrink-0 items-center gap-2 rounded-lg border border-border-primary bg-surface-gray px-[18px] py-2.5">
        <CalendarCheck size={15} className="text-fg-secondary" aria-hidden="true" />
        <span className="text-[13.5px] font-bold text-fg-secondary">提案の時間割に入っています</span>
      </span>
    );
  }

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
