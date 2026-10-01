"use client";

import AiChatPanel from "@/components/pc/AiChatPanel";
import { TIMETABLE_CONTEXT, useAiStore } from "@/lib/ai";
import { useProposalAssistant } from "@/lib/useProposalConversation";

/**
 * 提案画面のAIパネル（PC）。見た目は `AiChatPanel`、中身は `useProposalConversation`
 * （design.md §8.3）。モバイルの AI シートも同じ会話を使う。
 *
 * **提案前からこのパネルを使う。** 希望条件のための入力欄を別に設けず、同じ欄が
 * 提案の有無で `POST /api/proposal` と `POST /api/chat/proposal` に向かう
 * （§8.3.1）。同じ画面に入力欄を2つ並べると、学生はどちらに書けばよいかを
 * 画面から判断できないためである。
 *
 * **時間割で選んだ科目・空きコマを参照中の文脈にする**（§8.3.4。モバイルの
 * AI_STEP2・STEP3 と同じ）。選択は `TimetablePanel` と `useAiStore` の `selection` で共有する。
 */
export default function ChatPanel() {
  const conversation = useProposalAssistant();
  const selection = useAiStore((s) => s.selection);
  const setSelection = useAiStore((s) => s.setSelection);
  // 取り込み完了の「履修提案を受ける」から来たら、希望条件の欄にすぐ書けるようにする
  // （§8.3.1）。印はモバイルの時間割（`MobileProposalPage`）が下ろす
  const openOnArrival = useAiStore((s) => s.openOnArrival);
  return (
    <AiChatPanel
      conversation={conversation}
      autoFocus={openOnArrival}
      context={{
        base: TIMETABLE_CONTEXT,
        selection,
        onClear: () => setSelection(null),
        // 提案前は入力欄が希望条件の受け口なので、絞り方は案内しない
        hint: conversation.suggestionsFor ? "科目・空きコマを押すと絞れます" : undefined,
      }}
    />
  );
}
