import type { StudentProfile } from "@/lib/student";

export const DUMMY_PROFILES: { label: string; profile: StudentProfile }[] = [
  {
    label: "3回生・知能情報メディア課程",
    profile: {
      grade: 3,
      admissionYear: 2024,
      program: "知能情報メディア課程",
      completedCourses: [
        { title: "仏教の思想A", year: 2024, term: "前期", credits: 2, status: "passed", rawScore: "70" },
        { title: "仏教の思想B", year: 2024, term: "後期", credits: 2, status: "passed", rawScore: "70" },
        { title: "英語総合１（A）", year: 2024, term: "前期", credits: 1, status: "passed", rawScore: "33" },
        { title: "英語総合１（B）", year: 2024, term: "後期", credits: 1, status: "passed", rawScore: "86" },
        { title: "英語総合２（A）", year: 2024, term: "前期", credits: 1, status: "passed", rawScore: "66" },
        { title: "英語総合２（B）", year: 2024, term: "後期", credits: 1, status: "passed", rawScore: "74" },
        { title: "スポーツ技術学A", year: 2024, term: "前期", credits: 1, status: "passed", rawScore: "84" },
        { title: "スポーツ技術学B", year: 2025, term: "前期", credits: 1, status: "passed", rawScore: "90" },
        { title: "情報基礎", year: 2024, term: "前期", credits: 2, status: "passed", rawScore: "100" },
        { title: "メディア処理基礎", year: 2024, term: "後期", credits: 2, status: "passed", rawScore: "100" },
        { title: "ネットワーク基礎", year: 2024, term: "前期", credits: 2, status: "passed", rawScore: "94" },
        { title: "微分積分・演習", year: 2024, term: "前期", credits: 4, status: "passed", rawScore: "80" },
        { title: "情報システム基礎", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "100" },
        { title: "プログラミング基礎演習Ⅰ", year: 2024, term: "前期", credits: 2, status: "passed", rawScore: "96" },
        { title: "プログラミング基礎演習Ⅱ", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "100" },
        { title: "ソフトウェア基礎", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "93" },
        { title: "ハードウェア基礎", year: 2025, term: "後期", credits: 2, status: "passed", rawScore: "76" },
        { title: "データ構造とアルゴリズム・演習", year: 2025, term: "後期", credits: 4, status: "passed", rawScore: "95" },
      ],
    },
  },
  {
    label: "2回生・知能情報メディア課程（再履修あり）",
    profile: {
      grade: 2,
      admissionYear: 2025,
      program: "知能情報メディア課程",
      completedCourses: [
        { title: "仏教の思想A", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "65" },
        { title: "英語総合１（A）", year: 2025, term: "前期", credits: 1, status: "passed", rawScore: "60" },
        { title: "英語総合１（B）", year: 2025, term: "後期", credits: 1, status: "passed", rawScore: "72" },
        { title: "情報基礎", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "80" },
        { title: "プログラミング基礎演習Ⅰ", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "75" },
        { title: "微分積分・演習", year: 2025, term: "前期", credits: 4, status: "passed", rawScore: "62" },
      ],
    },
  },
  {
    label: "1回生・電子情報通信課程",
    profile: {
      grade: 1,
      admissionYear: 2026,
      program: "電子情報通信課程",
      completedCourses: [
        { title: "仏教の思想A", year: 2025, term: "前期", credits: 2, status: "passed", rawScore: "80" },
        { title: "英語総合１（A）", year: 2025, term: "前期", credits: 1, status: "passed", rawScore: "77" },
      ],
    },
  },
];
