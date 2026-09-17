"use client";

import { useEffect, useRef } from "react";
import { useStudentStore } from "@/lib/student";
import { useProposalStore } from "@/lib/proposal";
import { useChatStore } from "@/lib/chat";
import { streamProposal } from "@/lib/chatApi";
import { getAdmissionYear, programCodeOf } from "@/lib/programs";

export default function ProposalLoader() {
  const profile = useStudentStore((s) => s.profile);
  const { status, setStatus, setSnapshot, setResult } = useProposalStore();
  const { setProposalMessages } = useChatStore();
  const triggered = useRef(false);

  useEffect(() => {
    if (!profile || status !== "idle" || triggered.current) return;

    // 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は
    // 課程名なのでコードに解決する（design.md §4.4.2）。解決できない課程・
    // 入学年度未取得では提案を作れない（backend は対応課程外を 404 で返す）。
    // grade ではなく admissionYear でガードする: 5回生以上では grade が null に
    // なる場合があるが admissionYear は入学日から正確に読めている。
    const programCode = programCodeOf(profile.program);
    const admissionYear =
      profile.admissionYear ?? (profile.grade ? getAdmissionYear(profile.grade) : null);
    if (!programCode || !admissionYear) {
      setStatus("error");
      return;
    }

    triggered.current = true;
    setStatus("loading");

    const ctrl = new AbortController();

    streamProposal(
      {
        studentProfile: profile,
        programCode,
        admissionYear,
      },
      // 組み立て途中の提案。時間割表を逐次描画するために反映する（§6.1.1 / §7.2）
      (snapshot) =>
        setSnapshot(
          snapshot.courses ?? [],
          snapshot.totalCredits ?? 0,
          snapshot.summary ?? "",
        ),
      ctrl.signal,
    )
      .then((result) => {
        setResult(result.courses, result.totalCredits ?? 0, result.summary);
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
