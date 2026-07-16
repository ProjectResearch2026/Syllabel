import type { StudentProfile } from "@/lib/student";

export const DUMMY_PROFILES: { label: string; profile: StudentProfile }[] = [
  {
    label: "3回生・知能情報メディア課程",
    profile: {
      grade: 3,
      program: "知能情報メディア課程",
      completedCourses: [
        { code: "IME101", title: "プログラミング基礎", credits: 2, grade: "A" },
        { code: "IME102", title: "線形代数学", credits: 2, grade: "B" },
        { code: "IME103", title: "情報倫理", credits: 2, grade: "A" },
        { code: "IME201", title: "アルゴリズムとデータ構造", credits: 2, grade: "A" },
        { code: "IME202", title: "データベース論", credits: 2, grade: "B" },
        { code: "IME203", title: "計算機アーキテクチャ", credits: 2, grade: "C" },
        { code: "IME204", title: "OS論", credits: 2, grade: "A" },
        { code: "IME205", title: "情報理論", credits: 2, grade: "B" },
        { code: "GEN101", title: "英語コミュニケーションⅠ", credits: 2, grade: "B" },
        { code: "GEN102", title: "英語コミュニケーションⅡ", credits: 2, grade: "B" },
        { code: "GEN201", title: "微分積分学", credits: 2, grade: "C" },
      ],
    },
  },
  {
    label: "1回生・電子情報通信課程",
    profile: {
      grade: 1,
      program: "電子情報通信課程",
      completedCourses: [
        { code: "EIC101", title: "情報リテラシー", credits: 2, grade: "A" },
        { code: "GEN101", title: "英語コミュニケーションⅠ", credits: 2, grade: "B" },
        { code: "GEN201", title: "微分積分学", credits: 2, grade: "B" },
      ],
    },
  },
];
