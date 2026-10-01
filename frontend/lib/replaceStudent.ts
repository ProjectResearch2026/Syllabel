import { useCallback } from "react";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";
import { useProposalStore } from "@/lib/proposal";
import { useStudentStore, type StudentProfile } from "@/lib/student";

/**
 * 別の学生(取り込み直した成績表・切り替えたデモの学生)に差し替える。
 *
 * **前の学生の履修提案と会話は捨てる。** 提案の store と会話は学生ごとのもので、
 * 差し替えたあとも残すと、前の学生の時間割が新しい学生の時間割として表示され、
 * 卒業要件の見込み(`lib/requirements.ts`)にも前の学生の科目が今期の分として積まれていた。
 * 会話も前の学生の成績・時間割を前提にした内容なので一緒に捨てる。
 * 同じ学生の学年・科目を直すだけ(マイデータの編集)は `setProfile` をそのまま使う。
 */
export function useReplaceStudent(): (profile: StudentProfile) => void {
  const setProfile = useStudentStore((s) => s.setProfile);
  const clearProposal = useProposalStore((s) => s.clear);
  const clearChats = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  return useCallback(
    (profile: StudentProfile) => {
      clearProposal();
      clearChats();
      clearHistory();
      setProfile(profile);
    },
    [clearProposal, clearChats, clearHistory, setProfile],
  );
}
