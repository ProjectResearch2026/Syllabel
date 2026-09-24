"use client";

import AiChatPanel from "@/components/pc/AiChatPanel";
import { useSyllabusConversation } from "@/lib/useSyllabusConversation";

/**
 * シラバス全体に対する質問（ui-design_pc.pen 05_シラバス一覧 ChatPanel）。
 * 会話はモバイルの AI シートと共有する（`lib/useSyllabusConversation.ts`）。
 */
export default function SyllabusChatPanel() {
  return <AiChatPanel conversation={useSyllabusConversation()} />;
}
