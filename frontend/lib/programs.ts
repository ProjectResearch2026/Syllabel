/**
 * 課程の識別。design.md §4.4.2。
 *
 * 履修要項を引くキーは **(課程コード, 入学年度)** であり、課程コードが一次識別子で
 * ある。`StudentProfile.program` に入るのは成績表から採れる**課程名**(§5.2.1)で、
 * 課程は改称され得るため識別子には使えない。したがって backend
 * (`GET /api/curricula/{program_code}/{admission_year}`、`POST /api/proposal`)を
 * 呼ぶ前に、課程名 → 課程コードの解決をここで行う。
 *
 * 一覧は `curricula/admission-<年度>/` の課程ファイル(`program.code` / `program.name`)に
 * 対応する。コード `"06"` は入学年度で名称が異なる(2024年度入学: 環境生態工学課程、
 * 2025年度入学: 環境科学課程)ため、旧称を `aliases` に持たせる。
 */

export type Program = {
  /** 課程コード2桁。シラバスコード先頭4桁(`Y0XX`)と一致する一次識別子(§4.4.2) */
  code: string;
  /** 現行の課程名。入力UIの選択肢に使う */
  name: string;
  /** 別年度の名称。課程名からコードを引くときに参照する */
  aliases?: string[];
};

export const PROGRAMS: Program[] = [
  { code: "01", name: "数理・情報科学課程" },
  { code: "02", name: "知能情報メディア課程" },
  { code: "03", name: "電子情報通信課程" },
  { code: "04", name: "機械工学・ロボティクス課程" },
  { code: "05", name: "応用化学課程" },
  { code: "06", name: "環境科学課程", aliases: ["環境生態工学課程"] },
];

/** 入力UIの選択肢。現行の課程名のみを出す */
export const PROGRAM_NAMES: string[] = PROGRAMS.map((p) => p.name);

/** 成績表から課程名を読み取るための正規表現。旧称も拾う */
export const PROGRAM_NAME_PATTERN: RegExp = new RegExp(
  PROGRAMS.flatMap((p) => [p.name, ...(p.aliases ?? [])]).join("|"),
);

/** 課程名から課程コードを引く。未知の名称では null を返す */
export function programCodeOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const hit = PROGRAMS.find((p) => p.name === name || p.aliases?.includes(name));
  return hit?.code ?? null;
}

/**
 * 学年から入学年度を求める。年度は4月に切り替わる。
 *
 * 履修要項を引くキーのもう一方(§4.4.2)だが、プロファイルには入学年度が無い
 * (成績表から採れない)ため frontend が学年から算出して送る。
 */
export function getAdmissionYear(grade: number): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const academicYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return academicYear - grade + 1;
}
