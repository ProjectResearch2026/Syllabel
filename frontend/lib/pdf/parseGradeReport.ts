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
import { PROGRAM_NAME_PATTERN } from "@/lib/programs";

type PdfjsLib = typeof import("pdfjs-dist");

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

export interface ParseResult {
  profile: StudentProfile;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PASS_SCORE = 60;

const GRADE_SYMBOL_STATUS: Record<string, Course["status"]> = {
  N: "passed",    // 認定
  G: "passed",    // 合格
  T: "passed",    // 追試合格
  D: "failed",    // 不合格
  U: "failed",    // 追試不合格
  J: "withdrawn", // 辞退
  M: "withdrawn", // 無効
  W: "withdrawn", // 追試欠席
  Y: "withdrawn", // 追試無効
  K: "withdrawn", // 欠席
};

/**
 * 評価列の許容幅（px）。
 * 記号付きの評価は数字のみの行より上（y が約 6〜7 小さい位置）に描画されるため、
 * 「評価」ラベルの y から ±6 では記号を取りこぼす。
 *   例: 数字のみ y=274 / "T" y=268 + "65" y=277
 */
const EVAL_BAND = 12;

const GRADE_SYMBOLS = "NGDJTMUYWK";

/** "N 80" のような記号と数字の間の空白を除去して正規化する */
function normalizeScore(s: string): string {
  return s.replace(/\s+/g, "");
}

// 評価記号か数値スコアかを判定（"N90" / "N 80" のような記号+数字の複合形式も対象）
function isScore(s: string): boolean {
  const t = normalizeScore(s);
  return (
    t in GRADE_SYMBOL_STATUS ||
    /^\d{1,3}$/.test(t) ||
    new RegExp(`^[${GRADE_SYMBOLS}]\\d+$`).test(t)
  );
}

/**
 * 点数を伴う場合に、記号ではなく点数で合否を判定する記号。
 * 成績表の凡例では T は「追試」であって「追試合格」ではないため、
 * "T55" のように点数が付くときはその点数で判定する。
 */
const SCORE_DECIDES_SYMBOLS = new Set(["T"]);

function rawToStatus(raw: string): Course["status"] {
  const t = normalizeScore(raw);
  if (t in GRADE_SYMBOL_STATUS) return GRADE_SYMBOL_STATUS[t];
  // 記号+数字の複合形式（例: N90、T75）
  const combined = t.match(new RegExp(`^([${GRADE_SYMBOLS}])(\\d+)$`));
  if (combined) {
    const [, symbol, score] = combined;
    if (!SCORE_DECIDES_SYMBOLS.has(symbol)) return GRADE_SYMBOL_STATUS[symbol];
    return parseInt(score, 10) >= PASS_SCORE ? "passed" : "failed";
  }
  const n = parseInt(t, 10);
  if (!isNaN(n)) return n >= PASS_SCORE ? "passed" : "failed";
  return "withdrawn";
}

/**
 * 評価列で同一科目（同 x）に属する複数トークンを1つの評価文字列にまとめる。
 * 記号と点数が別アイテムに分かれている場合（"T" + "65" → "T65"）に対応する。
 * "#" のような評価記号でないマーカーは捨てる。
 */
function combineEvalTokens(tokens: TextItem[]): string | null {
  const parts = tokens
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((it) => normalizeScore(it.str))
    .filter(isScore);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  // 記号のみのトークンと数字のみのトークンが分離しているケースを結合
  const symbol = parts.find((t) => t in GRADE_SYMBOL_STATUS);
  const numeric = parts.find((t) => /^\d{1,3}$/.test(t));
  if (symbol && numeric) return symbol + numeric;
  return parts[0];
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
    // セクション区分行 (＊,＜) を除外。区分見出しは
    // "＜応用必修" / "１８単位＞" のように2行に割れて入るため、後半も落とす
    // （落とさないと "４単位＞" が5件並ぶ y=50 が科目名行に化ける）
    if (/^[＊＜＞*<>]/.test(it.str) || /単位＞$/.test(it.str)) continue;
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

  // 評価行 (y ≈ evaluationY) の items。
  // 記号は数字より上にずれて描画されるため EVAL_BAND の幅で拾うが、
  // 広げすぎると直上の最終学期行を評価と誤認するので、その手前で打ち切る。
  const lastTermY = [...yearTermMap.keys()]
    .filter((k) => k < evaluationY)
    .reduce((max, k) => Math.max(max, k), -Infinity);
  const bandUp = Number.isFinite(lastTermY)
    ? Math.min(EVAL_BAND, Math.max(4, evaluationY - lastTermY - 3))
    : EVAL_BAND;
  const evalItems = items.filter(
    (it) => it.y >= evaluationY - bandUp && it.y <= evaluationY + EVAL_BAND,
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
    if (/単位＞$/.test(title)) continue;

    const x = nameIt.x;

    // 単位数（x が近い単位行の item）
    const creditIt = creditItems.find((ci) => Math.abs(ci.x - x) <= 6);
    const rawCredit = creditIt?.str ?? "";
    // "2 100" / "2 T65" のように単位セルと直下の年度セルが1トークンに
    // 結合されることがある。前半が単位、後半がその学期の成績。
    const creditMatch = rawCredit.match(/^(\d{1,2})(?:\s+(\S+))?$/);
    const credits = creditMatch ? parseInt(creditMatch[1], 10) : 0;
    if (credits === 0 || credits > 8) continue;
    const mergedTermScore =
      creditMatch?.[2] && isScore(creditMatch[2]) ? creditMatch[2] : null;

    // 評価スコア（x が近い評価行の items をまとめる）
    const rawScore = combineEvalTokens(
      evalItems.filter((ei) => Math.abs(ei.x - x) <= 6),
    );
    if (!rawScore) continue;

    const status = rawToStatus(rawScore);

    // 年度・学期: 単位行より上(y大)、評価行より下(y小)の範囲でスコアを探す
    // - 単位行(creditY)の数字が isScore をパスするため creditY+5 以上に限定
    // - 評価バンドに食い込むと記号(例: y=268 の "T")を年度と誤認するため除外
    const termScoreCells = items
      .filter(
        (it) =>
          Math.abs(it.x - x) <= 6 &&
          it.y > creditY + 5 &&
          it.y < evaluationY - bandUp &&
          isScore(it.str),
      )
      .map((it) => ({ y: it.y, score: normalizeScore(it.str) }))
      .sort((a, b) => a.y - b.y); // y 昇順（＝年度順）
    // 結合トークンの場合、その学期の成績セルは単位行と同じ y にある
    if (mergedTermScore) {
      termScoreCells.unshift({ y: creditY, score: normalizeScore(mergedTermScore) });
    }

    // **修得した学期**を選ぶ。再履修した科目は成績セルが複数並ぶため、
    // 最初のセル（＝落とした回）を採ってはならない。評価列はその科目の最終結果
    // なので、評価と同じ値のセルがその科目を修得した学期である。
    //   例: ハードウェア基礎 41(2025前期) → 60(2026前期) / 評価 60 → 2026前期
    // 一致が見つからないときは最後（最新）のセルに寄せる。
    const passedCell =
      [...termScoreCells]
        .reverse()
        .find((c) => c.score === normalizeScore(rawScore)) ??
      termScoreCells[termScoreCells.length - 1];
    const termScoreY = passedCell?.y;

    let year = reportYear;
    let term: CourseTerm = "前期";

    if (termScoreY !== undefined) {
      // yearTermMap から最も近い year/term を探す
      let minDist = Infinity;
      for (const [ky, kv] of yearTermMap) {
        const d = Math.abs(ky - termScoreY);
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

  // 課程名。一覧の正本は `curricula/admission-<年度>/`（design.md §4.4.2）であり、
  // 旧称（環境生態工学課程）も拾う
  const programMatch = fullText.match(PROGRAM_NAME_PATTERN);
  const program = programMatch ? programMatch[0] : null;

  // 成績表の年度。ヘッダーでは "2025"(y=24) と "年度"(y=42) が別アイテムで、
  // 抽出順も隣接しないため、文字列マッチではなく座標で対応付ける。
  // 帳票左端(x<60)の "年度" ラベルの直上にある4桁数字がその年度。
  const yearLabel = items.find((it) => it.str === "年度" && it.x < 60);
  const reportYearItem = yearLabel
    ? items
        .filter(
          (it) =>
            /^\d{4}$/.test(it.str) &&
            Math.abs(it.x - yearLabel.x) <= 6 &&
            it.y < yearLabel.y,
        )
        .sort((a, b) => b.y - a.y)[0]
    : undefined;
  const reportYear = reportYearItem
    ? parseInt(reportYearItem.str, 10)
    : new Date().getFullYear();

  // 入学年度は履修グリッド左端の年度列の最小値から求める。
  // （学籍番号は個人情報保護の設計方針により抽出しない）
  const gridYears = items
    .filter((it) => /^\d{4}$/.test(it.str) && it.x >= 60 && it.x <= 75)
    .map((it) => parseInt(it.str, 10));
  let grade: StudentProfile["grade"] = null;
  if (gridYears.length > 0) {
    const admissionYear = Math.min(...gridYears);
    const raw = reportYear - admissionYear + 1;
    if (raw >= 1 && raw <= 4) grade = raw as 1 | 2 | 3 | 4;
  }

  return { grade, program, reportYear };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export async function parseGradeReport(file: File): Promise<ParseResult> {
  const pdfjsLib: PdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  return parseItems(await extractItems(pdfDoc));
}

/** 抽出済みテキストアイテムから成績を解析する（PDF 読み込みから独立、テスト可能） */
export function parseItems(items: TextItem[]): ParseResult {
  const warnings: string[] = [];

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
