export const DAYS = ["月", "火", "水", "木", "金"] as const;
export const PERIODS = [1, 2, 3, 4, 5] as const;

export type CourseType = "required" | "elective";
export type CourseCell = { name: string; type: CourseType } | null;
export type Timetable = Record<number, Record<string, CourseCell>>;

export const TIMETABLE: Timetable = {
  1: {
    月: { name: "線形代数", type: "required" },
    火: null,
    水: { name: "情報理論", type: "required" },
    木: null,
    金: { name: "微分方程式", type: "elective" },
  },
  2: {
    月: null,
    火: { name: "OS論", type: "required" },
    水: null,
    木: { name: "アルゴリズム", type: "required" },
    金: null,
  },
  3: {
    月: { name: "データベース", type: "elective" },
    火: null,
    水: null,
    木: null,
    金: { name: "確率統計", type: "required" },
  },
  4: {
    月: null,
    火: { name: "ソフトウェア工学", type: "elective" },
    水: null,
    木: { name: "機械学習", type: "elective" },
    金: null,
  },
  5: {
    月: null,
    火: null,
    水: null,
    木: null,
    金: null,
  },
};

export const CELL_STYLES: Record<CourseType, { bg: string; tag: string; label: string }> = {
  required: { bg: "bg-[#FFE8E9]", tag: "bg-[#E60012]", label: "必修" },
  elective: { bg: "bg-[#E8F0FF]", tag: "bg-[#1A2B4E]", label: "選択" },
};
