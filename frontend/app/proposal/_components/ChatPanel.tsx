"use client";

import AiChatPanel from "@/components/pc/AiChatPanel";
import { useProposalAssistant } from "@/lib/useProposalConversation";

/**
 * 提案画面のAIパネル（PC）。見た目は `AiChatPanel`、中身は `useProposalConversation`
 * （design.md §8.3）。モバイルの AI シートも同じ会話を使う。
 *
 * **提案前からこのパネルを使う。** 希望条件のための入力欄を別に設けず、同じ欄が
 * 提案の有無で `POST /api/proposal` と `POST /api/chat/proposal` に向かう
 * （§8.3.1）。同じ画面に入力欄を2つ並べると、学生はどちらに書けばよいかを
 * 画面から判断できないためである。
 */
export default function ChatPanel() {
  return <AiChatPanel conversation={useProposalAssistant()} />;
}
