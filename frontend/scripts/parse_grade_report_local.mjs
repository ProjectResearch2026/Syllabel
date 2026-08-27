/**
 * 成績表PDFを Node 上でパースして結果を表示する検証用ハーネス。
 * ブラウザを起動せずに lib/pdf/parseGradeReport.ts の解析ロジックを検証する。
 *
 *   node scripts/parse_grade_report_local.mjs <成績表.pdf> [...]
 *
 * PDF は個人情報なのでリポジトリに置かないこと。
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(process.cwd() + "/package.json");
const pdfjs = await import(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const { parseItems } = await import(process.cwd() + "/lib/pdf/parseGradeReport.ts");

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("usage: node scripts/parse_grade_report_local.mjs <成績表.pdf> [...]");
  process.exit(1);
}

for (const path of paths) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
  }).promise;

  const items = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      items.push({
        str: raw.str.trim(),
        x: Math.round(raw.transform[4]),
        y: Math.round(raw.transform[5]),
      });
    }
  }

  const { profile, warnings } = parseItems(items);
  const credits = profile.completedCourses.reduce((sum, c) => sum + c.credits, 0);
  console.log(`\n===== ${path.split("/").pop()} =====`);
  console.log(`学年=${profile.grade} 課程=${profile.program} 合格=${profile.completedCourses.length}件 単位計=${credits}`);
  if (warnings.length) console.log(`warnings: ${JSON.stringify(warnings)}`);
  for (const c of profile.completedCourses) {
    console.log(`  ${c.year}${c.term} ${c.credits}単位 [${c.rawScore}] ${c.title}`);
  }
}
