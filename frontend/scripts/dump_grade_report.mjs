/**
 * 成績表PDFのテキストアイテムをそのままダンプする診断スクリプト。
 *
 *   node scripts/dump_grade_report.mjs <成績表.pdf> [出力先.tsv]
 *
 * lib/pdf/parseGradeReport.ts が「何を見ているか」を確認するためのもの。
 * 出力には成績・学籍番号が含まれるのでコミットしないこと。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfjsPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const pdfjs = await import(pdfjsPath);

const [, , input, output] = process.argv;
if (!input) {
  console.error("usage: node scripts/dump_grade_report.mjs <成績表.pdf> [out.tsv]");
  process.exit(1);
}

const data = new Uint8Array(readFileSync(input));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

const items = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  for (const raw of content.items) {
    if (!("str" in raw) || !raw.str.trim()) continue;
    items.push({
      page: i,
      str: raw.str.trim(),
      x: Math.round(raw.transform[4]),
      y: Math.round(raw.transform[5]),
    });
  }
}

console.log(`pages=${doc.numPages} items=${items.length}`);

// --- パーサーの各判定を再現して、どこで落ちているかを表示 ---
const evalYs = [
  ...new Set(
    items
      .filter((it) => (it.str === "評" || it.str === "評価") && it.x >= 60 && it.x <= 90)
      .map((it) => it.y),
  ),
].sort((a, b) => a - b);
console.log("findEvaluationYValues ->", evalYs);

const yCount = new Map();
for (const it of items) {
  if (it.x <= 100 || it.x > 460) continue;
  if (/^[＊＜＞*<>]/.test(it.str) || /単位＞$/.test(it.str)) continue;
  if (!/[　-鿿＀-￯]/.test(it.str)) continue;
  const ry = Math.round(it.y / 5) * 5;
  yCount.set(ry, (yCount.get(ry) ?? 0) + 1);
}
const nameYs = [...yCount.entries()].filter(([, c]) => c >= 5).map(([y]) => y).sort((a, b) => a - b);
console.log("findCourseNameYValues (>=5件のy) ->", nameYs);
console.log("科目名y候補の全分布 ->", [...yCount.entries()].sort((a, b) => a[0] - b[0]).map(([y, c]) => `${y}:${c}`).join(" "));

const termItems = items.filter((it) => (it.str === "前" || it.str === "後") && it.x >= 75 && it.x <= 85);
const yearItems = items.filter((it) => /^\d{4}$/.test(it.str) && it.x >= 60 && it.x <= 75);
console.log(`buildYearTermMap -> 前/後ラベル=${termItems.length}件 年数字=${yearItems.length}件`);

// x<=100 の左端ヘッダー列（年度/学期/単位/評価のラベル）をそのまま出す
console.log("--- 左端ヘッダー列 (x<=100) ---");
for (const it of items.filter((it) => it.x <= 100).sort((a, b) => a.y - b.y)) {
  console.log(`  y=${String(it.y).padStart(4)} x=${String(it.x).padStart(4)} ${JSON.stringify(it.str)}`);
}

const tsv = ["page\tx\ty\tstr", ...items.map((it) => `${it.page}\t${it.x}\t${it.y}\t${it.str}`)].join("\n");
const dest = output ?? "grade_report_items.tsv";
writeFileSync(dest, tsv);
console.log(`\nfull dump -> ${dest}`);
