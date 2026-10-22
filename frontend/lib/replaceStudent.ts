import { useCallback } from "react";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";
import { useProposalStore } from "@/lib/proposal";
import { useStudentStore, type StudentProfile } from "@/lib/student";
import { useSyllabusUIStore } from "@/lib/syllabusUI";

/**
 * 別の学生(取り込み直した成績表・切り替えたデモの学生)に差し替える。
 *
 * **前の学生の履修提案と会話は捨てる。** 提案の store と会話は学生ごとのもので、
 * 差し替えたあとも残すと、前の学生の時間割が新しい学生の時間割として表示され、
 * 卒業要件の見込み(`lib/requirements.ts`)にも前の学生の科目が今期の分として積まれていた。
 * 会話も前の学生の成績・時間割を前提にした内容なので一緒に捨てる。
 *
 * **シラバス検索の絞り込みと検索条件も初期状態に戻す。** 必修・修得済みなどのタグは
 * 学生ごとに決まるため、前の学生のつもりで選んだ絞り込みは新しい学生には意味を持たない。
 * 残すと、ヘッダーの「シラバス」が前の学生のページ位置(`offset`)と絞り込みのまま
 * 一覧を開き、新しい学生では該当が少なく空のページが出ていた。リセット(全消去)と同じ扱い。
 * マイデータの訂正も、内容が変わったときはこれを通す(design.md §8.4)。学年・課程が変われば
 * 提案の前提が、科目が変われば修得済み・再履修の判断が変わり、前の提案と会話は当てはまらない。
 */
export function useReplaceStudent(): (profile: StudentProfile) => void {
  const setProfile = useStudentStore((s) => s.setProfile);
  const clearProposal = useProposalStore((s) => s.clear);
  const clearChats = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  const resetSyllabusUI = useSyllabusUIStore((s) => s.reset);
  return useCallback(
    (profile: StudentProfile) => {
      clearProposal();
      clearChats();
      clearHistory();
      resetSyllabusUI();
      setProfile(profile);
    },
    [clearProposal, clearChats, clearHistory, resetSyllabusUI, setProfile],
  );
}
