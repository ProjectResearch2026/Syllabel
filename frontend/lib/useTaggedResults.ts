"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useSyllabusUIStore,
  matchesFilter,
  isFiltering,
  type CourseTags,
} from "@/lib/syllabusUI";
import { useTagMap } from "@/lib/useTagMap";
import { targetOfPrograms } from "@/lib/eligibility";
import { fetchInstructorMap, type SyllabusListItem } from "@/lib/syllabus-api";

/** 表示する1行。 */
export type TaggedCourse = {
  course: SyllabusListItem;
  tags: CourseTags;
  /** 担当教員名。取得前・取得失敗時は null */
  instructors: string | null;
};

export type TaggedResults = {
  /** このページに表示する行 */
  visible: TaggedCourse[];
  /** 絞り込みに一致した総件数。ページ送りの母数 */
  matched: number;
  /** 絞り込み前の総件数 */
  total: number;
  /** 絞り込みが効いているか */
  filtering: boolean;
};

/**
 * 検索結果にタグを付け、絞り込んでから表示するページを切り出す。design.md §8。
 *
 * **絞り込みは検索結果の全件に効く。** タグは学生プロファイルとの突合で決まり
 * (§6.1)、プロファイルはブラウザにしか無いため api-clean の検索条件にできない。
 * さらに**絞り込んだ結果をサーバへ送ることもできない** — 「修得済みのコード一覧」は
 * その学生の成績そのものである(要件§5)。したがって振り分けはクライアントで
 * 閉じる必要があり、`searchCourses()` は条件に当たる全件を返し、履修可否の判定に
 * 要る対象課程は `fetchCourseTargets()` がまとめて渡す(§6.1.3)。
 *
 * **ページ送りはこの絞り込み後の並びに対して行う。** `offset` は URL に持ったまま
 * (詳細画面から戻ったときに位置を保つため。`lib/syllabusQuery.ts`)、その値で
 * 絞り込み後の配列を切る。総件数も絞り込み後の件数になるため、
 * 「1,219件」と表示しながら16件しか出ない、という食い違いが起きない。
 *
 * **PC・モバイルの双方から呼ぶ。** 同じ結果でなければならないため、切り出しと
 * 教員名の補完をここに1つだけ置く(§8.1 と同じ理由)。
 *
 * **対象課程が引けなくても検索は動く。** `targets` が null のとき、または当該
 * コードが表に無いときはタグを出さない(修得済みだけは成績の事実なので出る)。
 * タグは検索の付加価値であって前提ではないため、タグ付けの材料が欠けたことで
 * 一覧そのものを落としてはならない。
 */
export function useTaggedResults(
  results: SyllabusListItem[],
  /**
   * `syllabus_code` → 対象課程。**引けなかったときは null**(§6.1.3)。
   * その場合タグは修得済みだけになり、検索そのものは通常どおり動く。
   */
  targets: Record<string, string[]> | null,
  faculty: string,
  offset: number,
  limit: number,
): TaggedResults {
  const activeTag = useSyllabusUIStore((s) => s.activeTag);
  const activeCategory = useSyllabusUIStore((s) => s.activeCategory);
  const tagOf = useTagMap();

  const filtered = useMemo(() => {
    const tagged = results.map((course) => {
      // **対象課程が分からないときは `undefined` を渡す。** 空配列を渡してはならない
      // — 空配列は「課程指定なし(＝履修可)」を意味するため、引けなかったコードを
      // 全部履修可と扱ってしまい、PR #100 で直した誤タグが戻る(§6.1.3)
      const programs = targets?.[course.syllabus_code];
      const target = programs === undefined ? undefined : targetOfPrograms(programs, faculty);
      return { course, tags: tagOf(course.syllabus_code, target) };
    });
    return tagged.filter(({ tags }) => matchesFilter(tags, activeTag, activeCategory));
  }, [results, targets, faculty, tagOf, activeTag, activeCategory]);

  const page = useMemo(() => filtered.slice(offset, offset + limit), [filtered, offset, limit]);

  // 教員名は表示する行のぶんだけ引く(§6.2)。補助情報なので、揃う前でもカードは描く
  const [instructors, setInstructors] = useState<Record<string, string>>({});
  const codes = page.map((p) => p.course.syllabus_code).join(",");

  useEffect(() => {
    if (!codes) return;
    let cancelled = false;
    fetchInstructorMap(codes.split(","))
      .then((map) => {
        if (!cancelled) setInstructors((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {
        // 教員名が引けなくても一覧は出す
      });
    return () => {
      cancelled = true;
    };
  }, [codes]);

  return {
    visible: page.map((p) => ({ ...p, instructors: instructors[p.course.syllabus_code] ?? null })),
    matched: filtered.length,
    total: results.length,
    filtering: isFiltering(activeTag, activeCategory),
  };
}
