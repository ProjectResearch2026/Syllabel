export type CourseType = "required" | "elective" | "completed";

export type Course = {
  code: string;
  title: string;
  instructor: string;
  credits: number;
  semester: string;
  day: string;
  period: string;
  type: CourseType;
};

export const TYPE_META: Record<CourseType, { label: string; accent: string; pill: string }> = {
  required: { label: "必修", accent: "bg-[#E60012]", pill: "bg-[#E60012] text-white" },
  elective: { label: "選択", accent: "bg-[#1A2B4E]", pill: "bg-[#1A2B4E] text-white" },
  completed: { label: "修得済", accent: "bg-[#6B7280]", pill: "bg-[#6B7280] text-white" },
};

export const DEMO_COURSES: Course[] = [
  { code: "CS-101", title: "プログラミング基礎", instructor: "山田 教授", credits: 2, semester: "前期", day: "月", period: "1限", type: "required" },
  { code: "CS-201", title: "アルゴリズムとデータ構造", instructor: "鈴木 教授", credits: 2, semester: "前期", day: "火", period: "2限", type: "required" },
  { code: "CS-301", title: "機械学習入門", instructor: "佐藤 教授", credits: 2, semester: "後期", day: "水", period: "3限", type: "elective" },
  { code: "CS-302", title: "データベース論", instructor: "田中 教授", credits: 2, semester: "前期", day: "木", period: "2限", type: "elective" },
  { code: "CS-103", title: "線形代数学", instructor: "高橋 教授", credits: 2, semester: "前期", day: "金", period: "1限", type: "completed" },
  { code: "CS-401", title: "ソフトウェア工学", instructor: "渡辺 教授", credits: 2, semester: "後期", day: "月", period: "4限", type: "elective" },
  { code: "CS-104", title: "情報倫理", instructor: "伊藤 教授", credits: 2, semester: "前期", day: "火", period: "3限", type: "completed" },
];
