"use client";

import { useState } from "react";
import AiChatPanel from "@/components/pc/AiChatPanel";
import {
  PREFERENCES_NOTE,
  useProposalConversation,
} from "@/lib/useProposalConversation";

/**
 * 提案画面のAIパネル。見た目は `AiChatPanel`、中身は `useProposalConversation`
 * （design.md §8.3）。
 *
 * **提案前からこのパネルを使う。** 希望条件のための入力欄を別に設けず、同じ欄が
 * 提案の有無で `POST /api/proposal` と `POST /api/chat/proposal` に向かう
 * （§8.3.1）。同じ画面に入力欄を2つ並べると、学生はどちらに書けばよいかを
 * 画面から判断できないためである。
 */
export default function ChatPanel() {
  const {
    messages,
    streaming,
    generating,
    holdsProposal,
    canStart,
    send,
    startWithoutPreferences,
    restart,
    newChat,
    history,
    selectHistory,
  } = useProposalConversation();
  const [input, setInput] = useState("");

  // 提案を持っていないあいだは、この欄が希望条件の受け口である（§8.3.1）
  const actions = !canStart
    ? []
    : holdsProposal
      ? [{ label: "条件を変えて提案し直す", onClick: restart }]
      : [{ label: "希望条件なしで提案する", onClick: startWithoutPreferences }];

  return (
    <AiChatPanel
      title="AI履修アシスタント"
      messages={messages}
      input={input}
      onInputChange={setInput}
      onSend={() => {
        // Enter キーは無効なときも届くので、送れるときだけ入力を消す
        if (!input.trim() || streaming || !canStart) return;
        send(input);
        setInput("");
      }}
      placeholder={
        holdsProposal ? "提案について質問する…" : "希望条件を入力（例: 午前中を多めに）"
      }
      streaming={streaming}
      // 提案の生成は4〜5分かかり得る（§7.2）ので、待たせる長さを先に伝える（§4.1.4）
      thinkingLabel={generating ? "提案を作っています。4〜5分ほどかかります" : undefined}
      inputDisabled={!canStart}
      actions={actions}
      // 学生がその場で書く文章が記録されることを、書く場所の傍らで示す（§9.1）
      note={!holdsProposal && canStart ? PREFERENCES_NOTE : undefined}
      history={history}
      onSelectHistory={selectHistory}
      onNewChat={holdsProposal ? newChat : undefined}
    />
  );
}
