"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { courseKey, useProposalStore } from "@/lib/proposal";
import { detailHref, slotSearchHref } from "@/lib/syllabusQuery";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { useTargetTerm } from "@/lib/targetTerm";
import type { CourseTarget } from "@/app/_components/CourseMenu";

function keyOf(target: CourseTarget): string {
  return courseKey({ syllabusCode: target.entry.code ?? null, title: target.entry.name });
}

/**
 * 時間割の科目を押したときのメニュー(`CourseMenu`)の状態と操作。PC の
 * `TimetablePanel` とモバイルの `MobileProposalPage` が共有する。
 *
 * - **外す** — その場で時間割から除く(`removeCourse`)
 * - **別の科目に変更する** — 外す科目を `replacing` に置き、そのコマと時間割の学期で
 *   絞ったシラバス一覧を開く。講義詳細の「この科目に変更」で入れ替わる
 *   (`AddToTimetableButton`)
 *
 * 組み立ての途中とアシスタントの応答中はメニューを開かせない(`editable`)。届く時間割に
 * 上書きされる。
 */
export function useTimetableEditing() {
  const router = useRouter();
  const editable = useProposalStore((s) => s.status !== "loading" && !s.busy);
  const removeCourse = useProposalStore((s) => s.removeCourse);
  const startReplace = useProposalStore((s) => s.startReplace);
  const cancelReplace = useProposalStore((s) => s.cancelReplace);
  const { target: targetTerm } = useTargetTerm();
  const [menu, setMenu] = useState<CourseTarget | null>(null);

  // 時間割へ戻ってきたら、選ばずに戻った入れ替えは終わりにする
  useEffect(() => cancelReplace(), [cancelReplace]);

  const open = useCallback((target: CourseTarget) => setMenu(target), []);
  const close = useCallback(() => setMenu(null), []);

  const setProposalOrigin = useSyllabusUIStore((s) => s.setProposalOrigin);

  // 詳細画面の「戻る」を時間割へ向ける印を立ててから開く(`backLink()`、§8.1)。
  // **同じタブで開く(クライアント遷移)。** 学生プロファイルと提案はブラウザのメモリにしか
  // 無い(永続化しない)ため、別タブで開くと取り込み前の状態になり、戻っても提案が消えている
  const openSyllabus = useCallback(
    (target: CourseTarget) => {
      setMenu(null);
      const code = target.entry.code;
      if (!code) return;
      setProposalOrigin(code);
      router.push(detailHref(code));
    },
    [router, setProposalOrigin],
  );

  const replace = useCallback(
    (target: CourseTarget) => {
      setMenu(null);
      startReplace({
        key: keyOf(target),
        title: target.entry.name,
        day: target.day ?? undefined,
        period: target.period ?? undefined,
      });
      router.push(slotSearchHref(target.day, target.period, targetTerm.term));
    },
    [router, startReplace, targetTerm.term],
  );

  const remove = useCallback(
    (target: CourseTarget) => {
      setMenu(null);
      removeCourse(keyOf(target));
    },
    [removeCourse],
  );

  return { editable, menu, open, close, openSyllabus, replace, remove };
}
