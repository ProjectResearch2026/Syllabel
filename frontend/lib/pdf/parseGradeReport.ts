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

/**
 * 履修グリッドの「登録済み・成績未確定」の印。凡例は `***: 登録科目` /
 * `*: 継続履修中`。成績ではないため `isScore()` を通らず、従来は科目ごと捨てていた。
 * 印は点数と同じく学期の行の高さに刷られる。
 *   例(2025年9月作成の成績表): ＡＳＥＡＮグローバルプログラム の 2025前期セル
 *   (行 y=448)に `***` が y=446 で入る。後の成績表ではこのセルが評価 G になる
 */
const REGISTERED_MARKS = new Set(["***", "*"]);


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

/** yearTermMap から y に最も近い年度・学期を引く。無ければ成績表の年度の前期 */
function nearestYearTerm(
  yearTermMap: Map<number, YearTermEntry>,
  y: number,
  reportYear: number,
): { year: number; term: CourseTerm } {
  let year = reportYear;
  let term: CourseTerm = "前期";
  let minDist = Infinity;
  for (const [ky, kv] of yearTermMap) {
    const d = Math.abs(ky - y);
    if (d < minDist) {
      minDist = d;
      year = kv.year;
      term = kv.term;
    }
  }
  return { year, term };
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

    // 履修グリッドの成績セル: 単位行より上(y大)、評価行より下(y小)の範囲で探す
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

    // 評価スコア（x が近い評価行の items をまとめる）
    const evalScore = combineEvalTokens(
      evalItems.filter((ei) => Math.abs(ei.x - x) <= 6),
    );

    // **登録済み・成績未確定の科目**(`***` / `*`)。評価列は空で、グリッドの印が
    // 成績のセルより後(新しい学期)にあるときだけ登録中とみなす。再履修で登録中の
    // 科目は、前回の不合格のセルより後ろに印が来る
    const lastScoreY = termScoreCells[termScoreCells.length - 1]?.y ?? -Infinity;
    const registeredMark = evalScore
      ? undefined
      : items
          .filter(
            (it) =>
              Math.abs(it.x - x) <= 6 &&
              it.y > creditY + 5 &&
              it.y < evaluationY - bandUp &&
              REGISTERED_MARKS.has(it.str) &&
              it.y > lastScoreY,
          )
          .sort((a, b) => b.y - a.y)[0];
    if (registeredMark) {
      const { year, term } = nearestYearTerm(yearTermMap, registeredMark.y, reportYear);
      entries.push({
        x,
        title,
        credits,
        rawScore: registeredMark.str,
        status: "registered",
        year,
        term,
      });
      continue;
    }

    // **この様式は未修得の科目の評価列を空にする。** 不合格・履修辞退の成績は
    // 履修グリッドのセルにだけ入り(例: 心理学入門 58 / 環境としての情報技術 J)、
    // 評価列には何も刷られない。評価列だけを見て捨てると【再履修の対象】(§6.1)
    // に渡す科目が丸ごと落ちるため、グリッドの最後（最新）のセルに退避する。
    // **グリッドにセルが無い科目は除外する** — 科目名と単位だけが刷られた
    // 未履修の科目(配当年次が先の科目など)であり、未修得とは別物である。
    const rawScore = evalScore ?? termScoreCells[termScoreCells.length - 1]?.score;
    if (!rawScore) continue;

    const status = rawToStatus(rawScore);

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

    const { year, term } =
      termScoreY !== undefined
        ? nearestYearTerm(yearTermMap, termScoreY, reportYear)
        : { year: reportYear, term: "前期" as CourseTerm };

    entries.push({ x, title, credits, rawScore, status, year, term });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 学生基本情報抽出
// ---------------------------------------------------------------------------

function extractMeta(items: TextItem[]): {
  grade: StudentProfile["grade"];
  admissionYear: number | null;
  program: string | null;
  reportYear: number;
  issuedOn: string | null;
  enrollment: StudentProfile["enrollment"];
  metaWarnings: string[];
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

  // -----------------------------------------------------------------------
  // 入学年度・学年の読み取り
  //
  // 優先順位:
  //   1. 基本情報欄の入学日 (x≈461, y≈701): YYYY年MM月DD日 → 入学年度を算出
  //   2. 基本情報欄の学年欄 (x≈531, y≈701): N年 → 直接取得・照合
  //   3. フォールバック: 履修グリッド左端の年度列の最小値
  //      （再入学・編入・単位認定がある学生では最初の在籍年度がグリッドに
  //        含まれるため、現在の入学年度より小さくなり学年が過大推定される）
  // -----------------------------------------------------------------------
  //
  // **位置は見出し「入学日」から相対で決める。** 帳票は作成年度によって全体が縦に
  // ずれる(2026年9月作成は値の行が y=701、2024・2025年9月作成は y=719)。
  // 見出しの行から値の行までは3枚とも +30 で一定だった。見出しが見つからない
  // ときだけ従来の既定値(701)へ落とす
  const admissionLabel = items.find((it) => it.str === "入学日" && it.x >= 440 && it.x <= 480);
  const BASIC_INFO_Y = admissionLabel ? admissionLabel.y + BASIC_INFO_OFFSET : 701;
  const Y_TOLERANCE = admissionLabel ? 8 : 25;

  // 入学日: pdfjs がアイテムを細分化する場合があるため x=440〜520 を結合して探す
  const admissionDateText = items
    .filter((it) => Math.abs(it.y - BASIC_INFO_Y) <= Y_TOLERANCE && it.x >= 440 && it.x <= 520)
    .sort((a, b) => a.x - b.x)
    .map((it) => it.str)
    .join("");
  const admissionDateMatch = admissionDateText.match(/(\d{4})年(\d{2})月/);

  // 学年欄: "N年" (N は 1 桁) の単独アイテム
  const gradeTextItem = items.find(
    (it) =>
      /^[1-9]年$/.test(it.str) &&
      Math.abs(it.y - BASIC_INFO_Y) <= Y_TOLERANCE &&
      it.x >= 515 &&
      it.x <= 555,
  );

  let admissionYear: number | null = null;
  let grade: StudentProfile["grade"] = null;
  const metaWarnings: string[] = [];

  if (admissionDateMatch) {
    const calendarYear = parseInt(admissionDateMatch[1], 10);
    const month = parseInt(admissionDateMatch[2], 10);
    // 学年度は4月始まり
    admissionYear = month >= 4 ? calendarYear : calendarYear - 1;
    // 在籍年数。留年・休学があると学年(配当年次の基準)とは一致しない
    const enrolledYears = reportYear - admissionYear + 1;
    if (enrolledYears >= 1 && enrolledYears <= 4) grade = enrolledYears as 1 | 2 | 3 | 4;

    if (gradeTextItem) {
      const pdfGrade = parseInt(gradeTextItem.str[0], 10);
      if (grade !== null) {
        // 学年欄との照合
        if (grade !== pdfGrade) {
          metaWarnings.push(
            `学年の照合不一致: 入学日から算出=${grade}回生、PDF学年欄=${pdfGrade}回生。入学日の値を優先します。`,
          );
        }
      } else if (pdfGrade >= 1 && pdfGrade <= 4) {
        // 在籍年数が1〜4の外(5年目以降)。学年は学年欄で補うが、`admissionYear` は
        // **入学日側を残す**。履修要項を引くキーは入学年度であり(§4.4.2)、留年した
        // 学生に適用されるのは入学当時の要項だからである。
        //
        // ただしこの補完は「留年」と「入学日の誤読」を区別できない。誤読だった
        // 場合は学年だけ正しく見えて `admissionYear` が静かに間違い、履修要項が
        // 404 になって卒業必要単位数がフォールバック値に落ちる。どちらであっても
        // 在籍年数と学年欄は食い違っているので、補完したことを必ず警告に残す。
        grade = pdfGrade as 1 | 2 | 3 | 4;
        metaWarnings.push(
          `学年をPDF学年欄から補完しました: 入学日(${admissionYear}年度)と成績表(${reportYear}年度)から` +
            `算出した在籍年数=${enrolledYears}年目に対し、PDF学年欄=${pdfGrade}回生。` +
            `留年・休学であれば入学年度=${admissionYear}年度で正しいですが、` +
            `入学日を誤読していた場合は入学年度も誤っています。`,
        );
      }
    }
  } else if (gradeTextItem) {
    // 入学日を読めなかった場合は学年欄から直接取得
    const pdfGrade = parseInt(gradeTextItem.str[0], 10);
    if (pdfGrade >= 1 && pdfGrade <= 4) {
      grade = pdfGrade as 1 | 2 | 3 | 4;
      admissionYear = reportYear - pdfGrade + 1;
    }
  } else {
    // フォールバック: グリッド年度列の最小値から推定
    const gridYears = items
      .filter((it) => /^\d{4}$/.test(it.str) && it.x >= 60 && it.x <= 75)
      .map((it) => parseInt(it.str, 10));
    if (gridYears.length > 0) {
      const gridMin = Math.min(...gridYears);
      const raw = reportYear - gridMin + 1;
      if (raw >= 1 && raw <= 4) {
        grade = raw as 1 | 2 | 3 | 4;
        admissionYear = gridMin;
      }
    }
    metaWarnings.push(
      "入学日・学年欄を読み取れなかったため、履修グリッドの年度列最小値から学年を推定しました。再入学・編入・単位認定がある場合は学年が誤る可能性があります。",
    );
  }

  return {
    grade,
    admissionYear,
    program,
    reportYear,
    issuedOn: extractIssuedOn(items, reportYear),
    enrollment: extractEnrollment(items),
    metaWarnings,
  };
}

/** 基本情報欄の見出し(「入学日」)から値の行までの距離(pt)。3枚の実物で一定 */
const BASIC_INFO_OFFSET = 30;

/**
 * 成績表の作成日を `YYYY-MM-DD` で返す。
 *
 * 帳票の右上(PDF 上は左端 x≈57 の列)に `[ 学籍番号 ] 1 / 1 09 02 1` と並ぶうち、
 * ページ番号(`1 / 1`)の直後の2つが**作成月日**である。3枚の実物(2024-09-06 /
 * 2025-09-05 / 2026-09-02)すべてで PDF メタデータの作成日と一致した。年は刷られて
 * いないため帳票ヘッダの年度から補う(年度は4月始まりなので、1〜3月は年度+1)。
 *
 * ファイル名に入っている日時は**ダウンロード時刻**であり作成日ではない(ポータルは
 * 作成済みの PDF を配る。実物では2日〜2週間ずれていた)。
 */
function extractIssuedOn(items: TextItem[], reportYear: number): string | null {
  const pageMarker = items.find((it) => /^\d+\s*\/\s*\d+$/.test(it.str) && it.x < 60);
  if (!pageMarker) return null;
  const [month, day] = items
    .filter(
      (it) =>
        Math.abs(it.x - pageMarker.x) <= 4 && it.y > pageMarker.y && /^\d{2}$/.test(it.str),
    )
    .sort((a, b) => a.y - b.y)
    .map((it) => parseInt(it.str, 10));
  if (!month || !day || month > 12 || day > 31) return null;
  const year = month >= 4 ? reportYear : reportYear + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 「在籍年数 / 休学年数 / 在学年数」を読む。値は見出しと同じ列(x)の下にある
 * `2.5` のような 0.5 年刻みの数。**在籍年数が読めなければ null**(次の登録学期の
 * 検算に使えないため)。
 */
function extractEnrollment(items: TextItem[]): StudentProfile["enrollment"] {
  const valueBelow = (label: string): number | null => {
    const head = items.find((it) => it.str === label);
    if (!head) return null;
    const value = items
      .filter(
        (it) =>
          Math.abs(it.x - head.x) <= 3 &&
          it.y > head.y &&
          it.y - head.y <= 120 &&
          /^\d+\.\d$/.test(it.str),
      )
      .sort((a, b) => a.y - b.y)[0];
    return value ? parseFloat(value.str) : null;
  };
  const enrolledYears = valueBelow("在籍年数");
  if (enrolledYears === null) return null;
  return {
    enrolledYears,
    leaveYears: valueBelow("休学年数"),
    studyYears: valueBelow("在学年数"),
  };
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

  const { grade, admissionYear, program, reportYear, issuedOn, enrollment, metaWarnings } =
    extractMeta(items);
  warnings.push(...metaWarnings);
  if (!program) warnings.push("課程名を読み取れませんでした");
  if (!grade) warnings.push("学年を推定できませんでした");
  if (!issuedOn) warnings.push("成績表の作成日を読み取れませんでした");
  if (!enrollment) warnings.push("在籍年数を読み取れませんでした");

  const evaluationYValues = findEvaluationYValues(items);
  const courseNameYValues = findCourseNameYValues(items);
  const yearTermMap = buildYearTermMap(items);

  if (evaluationYValues.length === 0 || courseNameYValues.length === 0) {
    warnings.push("科目データの構造を認識できませんでした");
    return {
      profile: { grade, admissionYear, program, completedCourses: [], issuedOn, enrollment },
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

  // **成績表に載っている科目は履修状態ごと全件保持する**(要件§4.2)。
  // 不合格・履修辞退は【再履修の対象】として履修提案に渡す必要があり
  // (§6.1 の §7.3 プロンプト整形)、ここで落とすと常に空になる。
  // 卒業要件の単位計算に数えるのは passed だけであり、その絞り込みは
  // 単位を数える側(CreditBar / 取り込み確認 / マイデータ)が行う。
  const completedCourses: Course[] = allEntries
    .map((e) => ({
      title: e.title,
      year: e.year,
      term: e.term,
      credits: e.credits,
      status: e.status,
      rawScore: e.rawScore,
    }));

  return {
    profile: { grade, admissionYear, program, completedCourses, issuedOn, enrollment },
    warnings,
  };
}
