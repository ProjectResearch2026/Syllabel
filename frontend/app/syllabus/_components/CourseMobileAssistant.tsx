"use client";

import { useMemo } from "react";
import { courseContext } from "@/lib/ai";
import { useCourseConversation } from "@/lib/useCourseConversation";
import MobileAiAssistant from "@/components/ai/MobileAiAssistant";

/**
 * 講義詳細のモバイルの AI（ui-design_phone.pen 06 の BottomDock）。
 * 講義詳細はサーバ側描画なので、会話の hook を持つこの部分だけをクライアントにする。
 * 会話は PC の右パネル（`CourseChatPanel`）と共有する。
 */
export default function CourseMobileAssistant({
  code,
  title,
  questions,
}: {
  code: string;
  title: string;
  questions: string[];
}) {
  const conversation = useCourseConversation({ code, title, questions });
  // 参照中チップは講義名。毎回作ると Ask Bar の登録が描画ごとに走るので固定する
  const base = useMemo(() => courseContext(title, code), [title, code]);
  return <MobileAiAssistant conversation={conversation} base={base} />;
}
