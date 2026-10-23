"use client";

import AiChatPanel from "@/components/pc/AiChatPanel";
import { TIMETABLE_CONTEXT, useAiStore } from "@/lib/ai";
import { useProposalAssistant } from "@/lib/useProposalConversation";

/**
 * 提案画面のAIパネル（PC）。見た目は `AiChatPanel`、中身は `useProposalConversation`
 * （design.md §8.3）。モバイルの AI シートも同じ会話を使う。
 *
 * **時間割を組む前からこのパネルを使う。** 入力欄は1つで、何を書いても
 * `POST /api/timetable/assistant` に向かう（§8.3.1）。組み直すか質問に答えるかは
 * アシスタントが決める。
 *
 * **時間割で選んだ科目・空きコマを参照中の文脈にする**（§8.3.4。モバイルの
 * AI_STEP2・STEP3 と同じ）。選択は `TimetablePanel` と `useAiStore` の `selection` で共有する。
 */
export default function ChatPanel() {
  const conversation = useProposalAssistant();
  const selection = useAiStore((s) => s.selection);
  const setSelection = useAiStore((s) => s.setSelection);
  // 取り込み完了の「履修提案を受ける」から来たら、入力欄にすぐ書けるようにする
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
      }}
    />
  );
}
