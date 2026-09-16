/**
 * 成績評価(`grading`)の表示用パーサ。design.md §6.2。
 *
 * api-clean の `grading` は TEXT 列だが、**中身は JSON 文字列**である。
 * シラバスバックエンド側が両年度の表記を揃えた結果であり、
 * `{"評価項目": [{"項目", "割合", "基準", "備考"}], "自由記載": ...}` の形を採る。
 * そのまま描くと画面に JSON が出てしまうため、ここで構造へ戻す。
 *
 * **JSON として読めない値もあり得る**(構造化前の素テキストが残っている行)。
 * その場合は生テキストとして扱い、少なくとも読める形で出す。
 */

/** 評価項目1つ。割合の記載が無い項目もある(`割合: null`)。 */
export type GradingItem = {
  label: string;
  /** 配点(%)。記載が無ければ null */
  ratio: number | null;
  /** 評価基準の説明 */
  criterion: string | null;
  /** 項目ごとの備考 */
  note: string | null;
};

export type Grading =
  | { kind: "structured"; items: GradingItem[]; freeText: string | null }
  | { kind: "text"; text: string };

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asRatio(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // "60%" や "60" のような表記も拾う
  const text = typeof value === "string" ? value.match(/-?\d+(?:\.\d+)?/) : null;
  return text ? Number(text[0]) : null;
}

function toItem(value: unknown): GradingItem | null {
  if (typeof value !== "object" || value === null) {
    const text = asText(value);
    return text ? { label: text, ratio: null, criterion: null, note: null } : null;
  }
  const record = value as Record<string, unknown>;
  const label = asText(record["項目"]);
  const criterion = asText(record["基準"]);
  const note = asText(record["備考"]);
  const ratio = asRatio(record["割合"]);
  if (!label && !criterion && ratio === null) return null;
  return { label: label ?? "評価項目", ratio, criterion, note };
}

/**
 * `grading` を表示できる形にする。中身が無ければ null(節そのものを出さない)。
 */
export function parseGrading(raw: string | null | undefined): Grading | null {
  const source = raw?.trim();
  if (!source) return null;
  if (!source.startsWith("{")) return { kind: "text", text: source };

  let document: unknown;
  try {
    document = JSON.parse(source);
  } catch {
    // JSON のつもりで書かれていない値。生テキストとして出す
    return { kind: "text", text: source };
  }
  if (typeof document !== "object" || document === null) {
    return { kind: "text", text: source };
  }

  const record = document as Record<string, unknown>;
  const rawItems = record["評価項目"];
  const items = (Array.isArray(rawItems) ? rawItems : [])
    .map(toItem)
    .filter((item): item is GradingItem => item !== null);
  const freeText = asText(record["自由記載"]);

  if (items.length === 0) {
    // 項目が無く自由記載だけの行。JSON を見せずに本文だけ出す
    return freeText ? { kind: "text", text: freeText } : null;
  }
  return { kind: "structured", items, freeText };
}
