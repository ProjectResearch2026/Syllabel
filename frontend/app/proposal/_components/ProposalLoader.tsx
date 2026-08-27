"use client";

import { useEffect, useRef } from "react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useChatStore } from "@/lib/chat";
import { streamProposal } from "@/lib/chatApi";

export default function ProposalLoader() {
  const profile = useStudentStore((s) => s.profile);
  const { status, setStatus, setResult } = useProposalStore();
  const { setProposalMessages } = useChatStore();
  const triggered = useRef(false);

  useEffect(() => {
    if (!profile || status !== "idle" || triggered.current) return;
    triggered.current = true;

    setStatus("loading");

    const ctrl = new AbortController();

    streamProposal({ profile }, () => {}, ctrl.signal)
      .then(({ courses, totalCredits, message }) => {
        setResult(courses, totalCredits, message);
        // 初期チャットメッセージをリセットして提案メッセージが反映されるようにする
        setProposalMessages([]);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setStatus("error");
        }
      });

    return () => {
      ctrl.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return null;
}
