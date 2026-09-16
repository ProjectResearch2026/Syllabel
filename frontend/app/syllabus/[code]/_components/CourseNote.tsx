import type { ParsedNote } from "@/lib/note";

/**
 * 備考。**登録方法は見出し側のタグへ出しているので、ここには残りを置く。**
 *
 * `【対象】…` のようなラベル付きの注記はラベルと値に分け、履修要項の区分コードや
 * 記号(`Y4000` / `◎`)は原文のまま並べる(`lib/note.ts`)。意味を補って書き換えると
 * 誤りうるため、解釈はしない。
 */
export default function CourseNote({ note }: { note: ParsedNote }) {
  const others = note.flags.filter((flag) => !flag.includes("登録"));

  return (
    <div className="flex flex-col gap-2.5">
      {note.entries.map((entry) => (
        <div key={`${entry.label}-${entry.value}`} className="flex flex-col gap-0.5">
          <p className="text-[11px] font-semibold text-fg-muted">{entry.label}</p>
          <p className="text-[12.5px] leading-relaxed text-fg-secondary">{entry.value}</p>
        </div>
      ))}

      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((flag) => (
            <span
              key={flag}
              className="rounded border border-border-primary px-1.5 py-0.5 text-[11px] text-fg-secondary"
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {note.lines.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[11px] font-semibold text-fg-muted">履修要項の記載</p>
          <p className="font-mono text-[12px] leading-relaxed text-fg-secondary">
            {note.lines.join(" ")}
          </p>
        </div>
      )}
    </div>
  );
}
