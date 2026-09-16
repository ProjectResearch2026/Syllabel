import type { SyllabusDetail } from "@/lib/syllabus-api";

/**
 * 講義単位チャットの質問サジェスト。design.md §7.5。
 *
 * **シラバスに書かれていないことは聞かせない。** 講義単位チャットは対象講義の
 * シラバスをそのままモデルに渡し(`backend/app/api/chat_syllabus.py`)、
 * 「ツールが返した内容だけを根拠にする」「情報が無い事項は無いと答える」
 * という規則で答えさせる(§7.4.1)。したがって**元のシラバスに対応する記述が
 * 無い質問は、必ず「書かれていません」で終わる**。
 *
 * 例えば「課題の分量はどのくらい?」はシラバスの項目に対応が無く(分量を書いた
 * 科目はあっても、書式として持っていない)、多くの科目で空振りする。
 * そこで**その科目が実際に持っているフィールドからサジェストを組み立てる**。
 *
 * 履修要件(必修 / 選択必修)の判断は §7.4.1 の規則5 で禁じているため入れない。
 */
type Suggestion = { question: string; available: (s: SyllabusDetail) => boolean };

const hasText = (value: string | null | undefined) => !!value?.trim();

/** 上から順に、その科目で答えられるものを採る */
const SUGGESTIONS: Suggestion[] = [
  { question: "成績はどう評価される？", available: (s) => hasText(s.grading) },
  {
    question: "テキストは必要？",
    available: (s) => s.textbooks.length > 0 || hasText(s.textbook_note),
  },
  { question: "授業外の学習では何をする？", available: (s) => hasText(s.outside_study) },
  { question: "この授業で何ができるようになる？", available: (s) => hasText(s.goals) },
  { question: "毎回どんな内容を扱う？", available: (s) => s.course_plan.length > 0 },
  { question: "授業はどう進められる？", available: (s) => hasText(s.methods) },
  { question: "受講前に知っておくことは？", available: (s) => hasText(s.advice) },
];

/** チャット欄に並べる件数。パネルが狭いので絞る */
const MAX_SUGGESTIONS = 3;

export function courseQuestions(syllabus: SyllabusDetail): string[] {
  return SUGGESTIONS.filter((s) => s.available(syllabus))
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.question);
}
