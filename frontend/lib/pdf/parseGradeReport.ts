/**
 * 龍谷大学 成績表PDF パーサー
 *
 * PDF の物理レイアウト（ landscape 90° 回転格納）:
 *   - y 軸が視覚的な「列」に対応（低y = 左列、高y = 右列）
 *   - x 軸が視覚的な「行」に対応（各 x = 1科目）
 *
 * 主要 y 座標:
 *   セクション1（教養+専門基礎）: 科目名 y≈19, 単位 y≈132, 評価 y≈274
 *   セクション2（応用選択等）  : 科目名 y≈295, 単位 y≈408, 評価 y≈550
 *
 * 年度/学期の y 座標（セクション1）:
 *   前後交互: 2024前≈138, 2024後≈149, 2025前≈160, ... 評価≈274
 * 年度/学期の y 座標（セクション2）:
 *   2024前≈414, 2024後≈425, 2025前≈436, ... 評価≈550
 */

import type { Course, CourseTerm, StudentProfile } from "@/lib/student";

type PdfjsLib = typeof import("pdfjs-dist");

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

interface ParseResult {
  profile: StudentProfile;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PASS_SCORE = 60;

const GRADE_SYMBOL_STATUS: Record<string, Course["status"]> = {
  T: "passed",   // 追試合格
  J: "passed",   // 条件付合格
  D: "failed",   // 不合格
  N: "withdrawn", // 履修放棄
  G: "withdrawn", // 欠席
  M: "withdrawn", // 無効
};

// 評価記号か数値スコアかを判定
function isScore(s: string): boolean {
  const t = s.trim();
  return t in GRADE_SYMBOL_STATUS || /^\d{1,3}$/.test(t);
}

function rawToStatus(raw: string): Course["status"] {
  const t = raw.trim();
  if (t in GRADE_SYMBOL_STATUS) return GRADE_SYMBOL_STATUS[t];
  const n = parseInt(t, 10);
  if (!isNaN(n)) return n >= PASS_SCORE ? "passed" : "failed";
  return "withdrawn";
}

// ---------------------------------------------------------------------------
// テキスト抽出
// ---------------------------------------------------------------------------

async function extractItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
): Promise<TextItem[]> {
  const allItems: TextItem[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    for (const raw of content.items as PdfjsTextItem[]) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      allItems.push({
        str: raw.str.trim(),
        x: Math.round(raw.transform[4]),
        y: Math.round(raw.transform[5]),
      });
    }
  }
  return allItems;
}

// ---------------------------------------------------------------------------
// y 座標ブロック探索ユーティリティ
// ---------------------------------------------------------------------------

/** items の中から特定 y (±tol) にある items を x 昇順で返す */
function itemsAtY(items: TextItem[], y: number, tol = 4): TextItem[] {
  return items
    .filter((it) => Math.abs(it.y - y) <= tol)
    .sort((a, b) => a.x - b.x);
}

/** 「評価」ラベル（"評" + "価" が x≈71-82, 同 y）の y 座標一覧を返す */
function findEvaluationYValues(items: TextItem[]): number[] {
  // "評" か "評価" を含む x≈71-82 の item を探す
  const candidates = items.filter(
    (it) => (it.str === "評" || it.str === "評価") && it.x >= 60 && it.x <= 90,
  );
  return [...new Set(candidates.map((it) => it.y))].sort((a, b) => a - b);
}

/** 科目名行 y を推定: 多数の日本語テキストが同 y に並ぶ行を探す */
function findCourseNameYValues(items: TextItem[]): number[] {
  const yCount: Map<number, number> = new Map();
  for (const it of items) {
    // 日本語文字を含む、x>100 かつ x<460 の item（ヘッダー列除外）
    if (it.x <= 100 || it.x > 460) continue;
    // セクション区分行 (＊,＜) を除外
    if (/^[＊＜＞*<>]/.test(it.str)) continue;
    // 純粋な日本語・英数字混合のテキスト
    if (!/[　-鿿＀-￯]/.test(it.str)) continue;
    const ry = Math.round(it.y / 5) * 5;
    yCount.set(ry, (yCount.get(ry) ?? 0) + 1);
  }
  // 5科目以上が同 y に並ぶ行を採用し、近接重複を排除（10px 以内は大きい方を採用）
  const candidates = [...yCount.entries()]
    .filter(([, cnt]) => cnt >= 5)
    .map(([y]) => y)
    .sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const y of candidates) {
    if (deduped.length === 0 || y - deduped[deduped.length - 1] > 10) {
      deduped.push(y);
    }
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// 年度・学期マッピング構築
// ---------------------------------------------------------------------------

interface YearTermEntry {
  year: number;
  term: "前期" | "後期";
}

/** 前/後 ラベル (x≈80) + 年数字 (x≈68) から y→{year,term} マップを構築 */
function buildYearTermMap(items: TextItem[]): Map<number, YearTermEntry> {
  const map = new Map<number, YearTermEntry>();

  // 前/後 ラベルの y を収集（セクションごとに分ける必要があるが、ここでは全体）
  const termItems = items.filter(
    (it) => (it.str === "前" || it.str === "後") && it.x >= 75 && it.x <= 85,
  );

  // 年数字の y を収集
  const yearItems = items.filter(
    (it) => /^\d{4}$/.test(it.str) && it.x >= 60 && it.x <= 75,
  );

  for (const termIt of termItems) {
    // 最も近い年数字を探す（±30px 以内）
    let nearest: TextItem | null = null;
    let minDist = 30;
    for (const yearIt of yearItems) {
      const d = Math.abs(yearIt.y - termIt.y);
      if (d < minDist) {
        minDist = d;
        nearest = yearIt;
      }
    }
    if (!nearest) continue;
    map.set(termIt.y, {
      year: parseInt(nearest.str, 10),
      term: termIt.str === "前" ? "前期" : "後期",
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// セクション解析
// ---------------------------------------------------------------------------

interface CourseEntry {
  x: number;
  title: string;
  credits: number;
  rawScore: string;
  status: Course["status"];
  year: number;
  term: CourseTerm;
}

/**
 * 1つのセクション（科目名行 y, 評価行 y）を解析して CourseEntry リストを返す
 */
function parseSection(
  items: TextItem[],
  courseNameY: number,
  evaluationY: number,
  yearTermMap: Map<number, YearTermEntry>,
  reportYear: number,
): CourseEntry[] {
  // 科目名行 (y ≈ courseNameY) の items
  const nameItems = itemsAtY(items, courseNameY, 6);
  if (nameItems.length === 0) return [];

  // 評価行 (y ≈ evaluationY) のスコア items
  const evalItems = itemsAtY(items, evaluationY, 6).filter((it) =>
    isScore(it.str),
  );

  // 単位行: courseNameY と evaluationY の間で、多数の単純数字が並ぶ行を探す
  // 具体的には evaluationY から courseNameY の間（y が大きい方が評価に近い）
  const creditYCandidates = [
    ...new Set(
      items
        .filter(
          (it) =>
            it.y > courseNameY &&
            it.y < evaluationY &&
            /^\d{1,2}$/.test(it.str) &&
            it.x >= 90 &&
            it.x <= 460,
        )
        .map((it) => it.y),
    ),
  ].sort((a, b) => a - b);

  // 最も多くの数字が集まる y を単位行とする
  let creditY = courseNameY + 10; // fallback
  let maxCreditCount = 0;
  for (const cy of creditYCandidates) {
    const cnt = itemsAtY(items, cy, 4).filter(
      (it) => /^\d{1,2}$/.test(it.str) && parseInt(it.str, 10) <= 8,
    ).length;
    if (cnt > maxCreditCount) {
      maxCreditCount = cnt;
      creditY = cy;
    }
  }
  const creditItems = itemsAtY(items, creditY, 4);

  const entries: CourseEntry[] = [];

  for (const nameIt of nameItems) {
    const title = nameIt.str;
    if (!title || title.length < 2) continue;
    // 括弧類・記号だけの行をスキップ
    if (/^[<＜＊*\[\]（）()【】]+$/.test(title)) continue;
    if (/^＊/.test(title) || /^＜/.test(title)) continue;

    const x = nameIt.x;

    // 単位数（x が近い単位行の item）
    const creditIt = creditItems.find((ci) => Math.abs(ci.x - x) <= 6);
    const rawCredit = creditIt?.str ?? "";
    // "2 100" のような複合 token を考慮
    const creditMatch = rawCredit.match(/^(\d{1,2})/);
    const credits = creditMatch ? parseInt(creditMatch[1], 10) : 0;
    if (credits === 0 || credits > 8) continue;

    // 評価スコア（x が近い評価行の item）
    const evalIt = evalItems.find((ei) => Math.abs(ei.x - x) <= 6);
    if (!evalIt) continue;

    const rawScore = evalIt.str;
    const status = rawToStatus(rawScore);

    // 年度・学期: 単位行より上(y大)、評価行より下(y小)の範囲でスコアを探す
    // 単位行(creditY)の数字が isScore をパスするため、creditY+5 以上に限定する
    const scoreInTermRange = items
      .filter(
        (it) =>
          Math.abs(it.x - x) <= 6 &&
          it.y > creditY + 5 &&
          it.y < evaluationY - 5 &&
          isScore(it.str),
      )
      .sort((a, b) => a.y - b.y)[0]; // y 昇順（最も早い年度）

    let year = reportYear;
    let term: CourseTerm = "前期";

    if (scoreInTermRange) {
      // yearTermMap から最も近い year/term を探す
      let minDist = Infinity;
      for (const [ky, kv] of yearTermMap) {
        const d = Math.abs(ky - scoreInTermRange.y);
        if (d < minDist) {
          minDist = d;
          year = kv.year;
          term = kv.term;
        }
      }
    }

    entries.push({ x, title, credits, rawScore, status, year, term });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 学生基本情報抽出
// ---------------------------------------------------------------------------

function extractMeta(items: TextItem[]): {
  grade: StudentProfile["grade"];
  program: string | null;
  reportYear: number;
} {
  const fullText = items.map((it) => it.str).join(" ");

  // 課程名
  const programMatch = fullText.match(/(知能情報メディア|電子情報通信|機械工学・ロボティクス|応用化学|数理・情報科学|生命科学)課程/);
  const program = programMatch ? programMatch[0] : null;

  // 成績表の年度（"2025年度" など）
  const reportYearMatch = fullText.match(/(\d{4})年度/);
  const reportYear = reportYearMatch ? parseInt(reportYearMatch[1], 10) : new Date().getFullYear();

  // 学籍番号から入学年度を推定（Y240159 → 2024年度入学）
  const idMatch = fullText.match(/[YyＹ](\d{2})\d+/);
  let grade: StudentProfile["grade"] = null;
  if (idMatch) {
    const admissionYear = 2000 + parseInt(idMatch[1], 10);
    const raw = reportYear - admissionYear + 1;
    if (raw >= 1 && raw <= 4) grade = raw as 1 | 2 | 3 | 4;
  }

  return { grade, program, reportYear };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export async function parseGradeReport(file: File): Promise<ParseResult> {
  const warnings: string[] = [];

  const pdfjsLib: PdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib
    .getDocument({ data: arrayBuffer })
    .promise;

  const items = await extractItems(pdfDoc);

  const { grade, program, reportYear } = extractMeta(items);
  if (!program) warnings.push("課程名を読み取れませんでした");
  if (!grade) warnings.push("学年を推定できませんでした");

  const evaluationYValues = findEvaluationYValues(items);
  const courseNameYValues = findCourseNameYValues(items);
  const yearTermMap = buildYearTermMap(items);

  if (evaluationYValues.length === 0 || courseNameYValues.length === 0) {
    warnings.push("科目データの構造を認識できませんでした");
    return {
      profile: { grade, program, completedCourses: [] },
      warnings,
    };
  }

  // 各科目名行を、最も近い（y が大きい）評価行とペアリング
  const allEntries: CourseEntry[] = [];
  for (const nameY of courseNameYValues) {
    // nameY より大きい（高い） 評価 y を探す
    const evalY = evaluationYValues.find((ey) => ey > nameY + 50);
    if (!evalY) continue;
    const entries = parseSection(items, nameY, evalY, yearTermMap, reportYear);
    allEntries.push(...entries);
  }

  if (allEntries.length === 0) {
    warnings.push("科目データを読み取れませんでした");
  }

  // passed のみを completedCourses として保持
  const completedCourses: Course[] = allEntries
    .filter((e) => e.status === "passed")
    .map((e) => ({
      title: e.title,
      year: e.year,
      term: e.term,
      credits: e.credits,
      status: e.status,
      rawScore: e.rawScore,
    }));

  return {
    profile: { grade, program, completedCourses },
    warnings,
  };
}
