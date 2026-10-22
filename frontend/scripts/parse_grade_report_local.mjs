/**
 * 成績表PDFを Node 上でパースして結果を表示する検証用ハーネス。
 * ブラウザを起動せずに lib/pdf/parseGradeReport.ts の解析ロジックを検証する。
 *
 *   node scripts/parse_grade_report_local.mjs <成績表.pdf> [...]
 *
 * frontend/ を作業ディレクトリにして実行すること(`@/` の解決基点にしている)。
 *
 * PDF は個人情報なのでリポジトリに置かないこと。
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

// tsconfig の `@/*` エイリアスは Node の解決規則には無いので、ここで肩代わりする。
// これが無いと lib/pdf/parseGradeReport.ts の `@/lib/programs` が
// ERR_MODULE_NOT_FOUND になり、このハーネス自体が起動しない。
const projectRoot = pathToFileURL(process.cwd() + "/");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const base = new URL(specifier.slice(2), projectRoot);
    for (const candidate of ["", ".ts", ".tsx", "/index.ts"]) {
      const url = new URL(base.href + candidate);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(base.href, context);
  },
});

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
  // 取り込みは全科目。単位計は合格したものだけを数える(要件§4.2)
  const passed = profile.completedCourses.filter((c) => c.status === "passed");
  const unearned = profile.completedCourses.filter((c) => c.status !== "passed");
  const credits = passed.reduce((sum, c) => sum + c.credits, 0);
  console.log(`\n===== ${path.split("/").pop()} =====`);
  console.log(
    `学年=${profile.grade} 課程=${profile.program} ` +
      `全${profile.completedCourses.length}件(修得${passed.length}/未修得${unearned.length}) 修得単位計=${credits}`,
  );
  if (warnings.length) console.log(`warnings: ${JSON.stringify(warnings)}`);
  for (const c of profile.completedCourses) {
    const mark = c.status === "passed" ? "修得  " : "未修得";
    console.log(`  ${mark} ${c.year}${c.term} ${c.credits}単位 [${c.status}] ${c.title}`);
  }
}
