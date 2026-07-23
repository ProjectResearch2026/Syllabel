import type { Course, CourseTerm, StudentProfile } from "@/lib/student";

// pdfjs-dist は動的 import する(Next.js SSR 非対応のため)
type PdfjsLib = typeof import("pdfjs-dist");

// pdfjs-dist の TextItem 相当をローカルで定義
interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const GRADE_SYMBOL_PASS = new Set(["T", "J"]);  // 認定・条件付合格
const GRADE_SYMBOL_FAIL = new Set(["D"]);        // 不合格
const GRADE_SYMBOL_WITHDRAWN = new Set(["N", "G", "M"]); // 履修放棄・欠席・無効

// 評価スコアの合格ライン
const PASS_SCORE = 60;

// 課程名テキストを抽出する正規表現（成績表上部に記載）
const RE_PROGRAM = /先端理工学部\s+(\S+課程)/;

// 入学年度から学年を算出するための年度ヘッダー
const RE_YEAR_HEADER = /^(\d{4})年度$/;

// 学年番号（例: "Y240159" → 入学年2024 → 2025年度で2回生）
const RE_STUDENT_ID = /[YyＹ](\d{2})\d+/;

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ParseResult {
  profile: StudentProfile;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function isNumericScore(s: string): boolean {
  return /^\d{1,3}$/.test(s.trim());
}

function scoreToStatus(raw: string): Course["status"] {
  const s = raw.trim();
  if (GRADE_SYMBOL_PASS.has(s)) return "passed";
  if (GRADE_SYMBOL_FAIL.has(s)) return "failed";
  if (GRADE_SYMBOL_WITHDRAWN.has(s)) return "withdrawn";
  if (isNumericScore(s)) {
    return parseInt(s, 10) >= PASS_SCORE ? "passed" : "failed";
  }
  // 不明な記号は未評価とみなして withdrawn 扱い
  return "withdrawn";
}

/** 2つの数値が近いかどうか（同じ行とみなす閾値） */
function sameRow(yA: number, yB: number, tol = 3): boolean {
  return Math.abs(yA - yB) <= tol;
}

/** テキストアイテムを行ごとにグループ化（y座標降順） */
function groupByRow(items: TextItem[], tol = 3): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && sameRow(last[0].y, item.y, tol)) {
      last.push(item);
    } else {
      rows.push([item]);
    }
  }
  // 各行を x 座標昇順に並び替え
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

/** 成績表の開講年度カラムヘッダーを読んでいるか（年度列のパターン） */
function isYearHeader(s: string): boolean {
  return /^\d{4}$/.test(s.trim());
}

// ---------------------------------------------------------------------------
// ページごとのテキスト取得
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPageItems(page: any): Promise<TextItem[]> {
  const content = await page.getTextContent();
  return (content.items as PdfjsTextItem[])
    .filter((item): item is PdfjsTextItem => "str" in item)
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }));
}

// ---------------------------------------------------------------------------
// 成績表レイアウト解析
//
// 龍谷大学成績表の構造:
//   - ヘッダー行: 科目名, 単位, 年度列(2024,2025,…), 評価
//   - 科目行: 科目名テキスト, (単位数), (年度ごとのスコア列), (評価欄のスコア/記号)
//   - 区分行: < ... > 形式のヘッダー行は科目ではない
//   - 「#」は再履修マーカー（評価列に先行して現れる）
//
// アプローチ:
//   1. 全テキストを行単位でグループ化
//   2. ヘッダー行から年度列の x 座標を特定
//   3. 各科目行を左から読み: 科目名 → 単位 → 年度ごとの評価列
//   4. 最右の評価欄（「評価」列）から status/rawScore を確定
// ---------------------------------------------------------------------------

interface YearColumn {
  year: number;
  /** 前期(前)列の x 範囲 */
  xFront: number;
  /** 後期(後)列の x 範囲 */
  xBack: number;
}

/**
 * 成績表ヘッダー行から年度列マッピングを構築する。
 * ヘッダーは "2024 前 後 2025 前 後 ..." のように並ぶ。
 */
function parseYearColumns(allRows: TextItem[][]): YearColumn[] {
  const cols: YearColumn[] = [];
  // 年度数字が並ぶ行を探す
  for (const row of allRows) {
    const yearCells = row.filter((item) => /^\d{4}$/.test(item.str.trim()));
    if (yearCells.length >= 2) {
      // 年度ヘッダー行を発見。直後の「前」「後」トークンを探す
      for (const yc of yearCells) {
        const year = parseInt(yc.str.trim(), 10);
        // 同行内で year より右にある「前」「後」を探す
        const siblings = row.filter((it) => it.x > yc.x);
        const frontCell = siblings.find((it) => it.str.trim() === "前");
        const backCell = siblings.find((it) => it.str.trim() === "後");
        if (frontCell && backCell) {
          cols.push({ year, xFront: frontCell.x, xBack: backCell.x });
        }
      }
      if (cols.length > 0) break;
    }
  }
  return cols;
}

/**
 * 1行分のテキストセルから科目エントリを生成する試み。
 * 戻り値 null は「科目行でない」ことを示す。
 */
function parseCourseRow(
  row: TextItem[],
  yearCols: YearColumn[],
  reportYear: number,
): Course | null {
  if (row.length < 2) return null;

  const texts = row.map((it) => it.str.trim()).filter(Boolean);

  // 区分行・ヘッダー行・空行をスキップ
  if (texts.length === 0) return null;
  const first = texts[0];
  if (
    first.startsWith("<") ||
    first.startsWith("＊") ||
    first.startsWith("*") ||
    /^\d{4}$/.test(first) ||
    first === "科目名" ||
    first === "単" ||
    first === "位"
  ) {
    return null;
  }

  // 科目名: 先頭セル（「#」が前置されることがある）
  let title = first.replace(/^#\s*/, "").trim();
  if (!title || title.length < 2) return null;

  // 単位数: 2列目付近の1〜2桁数字
  const creditsCell = row.find((it) => /^\d{1,2}$/.test(it.str.trim()) && it.x > row[0].x);
  if (!creditsCell) return null;
  const credits = parseInt(creditsCell.str.trim(), 10);
  if (credits < 1 || credits > 8) return null;

  // 評価欄: 行中の最右スコア列（数値または評価記号）
  // 評価記号 or 数値が含まれるセルを右から探す
  const scoreCandidates = row
    .filter((it) => {
      const s = it.str.trim();
      return (
        isNumericScore(s) ||
        GRADE_SYMBOL_PASS.has(s) ||
        GRADE_SYMBOL_FAIL.has(s) ||
        GRADE_SYMBOL_WITHDRAWN.has(s)
      );
    })
    .sort((a, b) => b.x - a.x); // 右から

  if (scoreCandidates.length === 0) return null;

  const rawScore = scoreCandidates[0].str.trim();
  const status = scoreToStatus(rawScore);

  // 開講年度・学期を年度列から推定
  // 評価が入っている列の x 座標に近い年度列を探す
  let year = reportYear;
  let term: CourseTerm = "前期";

  if (yearCols.length > 0) {
    const scoreX = scoreCandidates[0].x;
    let minDist = Infinity;
    for (const yc of yearCols) {
      const distFront = Math.abs(scoreX - yc.xFront);
      const distBack = Math.abs(scoreX - yc.xBack);
      if (distFront < minDist) {
        minDist = distFront;
        year = yc.year;
        term = "前期";
      }
      if (distBack < minDist) {
        minDist = distBack;
        year = yc.year;
        term = "後期";
      }
    }
  }

  return { title, credits, year, term, status, rawScore };
}

// ---------------------------------------------------------------------------
// 学生情報（学年・課程）の抽出
// ---------------------------------------------------------------------------

function extractStudentMeta(allText: string): {
  grade: StudentProfile["grade"];
  program: string | null;
  admissionYear: number | null;
} {
  const programMatch = allText.match(RE_PROGRAM);
  const program = programMatch ? programMatch[1] : null;

  // 学籍番号から入学年度を推定（Y240159 → 2024年入学）
  const idMatch = allText.match(RE_STUDENT_ID);
  let admissionYear: number | null = null;
  if (idMatch) {
    admissionYear = 2000 + parseInt(idMatch[1], 10);
  }

  // 成績表ヘッダーの「2025年度」から報告年度を取得
  const reportYearMatch = allText.match(/(\d{4})年度\s+龍谷大学/);
  const reportYear = reportYearMatch ? parseInt(reportYearMatch[1], 10) : null;

  let grade: StudentProfile["grade"] = null;
  if (admissionYear && reportYear) {
    const raw = reportYear - admissionYear + 1;
    if (raw >= 1 && raw <= 4) grade = raw as 1 | 2 | 3 | 4;
  }

  return { grade, program, admissionYear };
}

// ---------------------------------------------------------------------------
// メインエントリ
// ---------------------------------------------------------------------------

export async function parseGradeReport(file: File): Promise<ParseResult> {
  const warnings: string[] = [];

  // pdfjs-dist を動的インポート（SSR 回避）
  const pdfjsLib: PdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  const allItems: TextItem[] = [];
  const allText: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const items = await getPageItems(page);
    allItems.push(...items);
    allText.push(...items.map((it) => it.str));
  }

  const fullText = allText.join(" ");

  // 学生基本情報
  const { grade, program, admissionYear } = extractStudentMeta(fullText);
  if (!program) warnings.push("課程名を読み取れませんでした");
  if (!grade) warnings.push("学年を推定できませんでした");

  // 年度列ヘッダーを解析
  const allRows = groupByRow(allItems);

  // 報告年度（成績表右上の「YYYY年度」）
  const reportYearMatch = fullText.match(/(\d{4})年度\s+龍谷大学/);
  const reportYear = reportYearMatch
    ? parseInt(reportYearMatch[1], 10)
    : admissionYear
      ? admissionYear + (grade ?? 1) - 1
      : new Date().getFullYear();

  const yearCols = parseYearColumns(allRows);

  // 科目行を抽出
  const courses: Course[] = [];
  const seenTitles = new Set<string>();

  for (const row of allRows) {
    const course = parseCourseRow(row, yearCols, reportYear);
    if (!course) continue;
    // 重複除去（同科目が複数行に現れる場合、最後の評価を採用）
    if (seenTitles.has(course.title)) {
      const existing = courses.findIndex((c) => c.title === course.title);
      if (existing !== -1) courses[existing] = course;
    } else {
      seenTitles.add(course.title);
      courses.push(course);
    }
  }

  if (courses.length === 0) {
    warnings.push("科目データを読み取れませんでした");
  }

  // passed のみを completedCourses として保持（設計書§4.1.3）
  const completedCourses = courses.filter((c) => c.status === "passed");

  const profile: StudentProfile = {
    grade,
    program,
    completedCourses,
  };

  return { profile, warnings };
}
