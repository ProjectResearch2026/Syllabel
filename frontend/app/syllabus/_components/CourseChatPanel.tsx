"use client";

import AiChatPanel from "@/components/pc/AiChatPanel";
import { useCourseConversation } from "@/lib/useCourseConversation";

/**
 * 講義詳細のAIパネル（ui-design_pc.pen 06_講義詳細 ChatPanel）。
 * 会話はモバイルの AI シートと共有する（`lib/useCourseConversation.ts`）。
 */
export default function CourseChatPanel({
  code,
  title,
  questions,
}: {
  code: string;
  title: string;
  /** その科目のシラバスで答えられる質問だけを並べる(`lib/courseQuestions.ts`) */
  questions: string[];
}) {
  return <AiChatPanel conversation={useCourseConversation({ code, title, questions })} />;
}
