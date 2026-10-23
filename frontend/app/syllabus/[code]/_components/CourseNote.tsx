import type { NoteBody } from "@/lib/note";

/**
 * 備考。**登録方法は見出し側のタグへ出しているので、ここには残りを置く。**
 *
 * `【対象】…` のようなラベル付きの注記はラベルと値に分けて並べる(`lib/note.ts`)。
 *
 * **何を残すかは `pruneNote()` が決める**(`lib/note.ts`)。登録方法は見出しへ、
 * 対象課程と重なる `【対象】` は基本情報へ寄せてあり、履修要項の区分コードや
 * 記号(`Y4000` / `◎`)は出さないため、ここには来ない。
 */
export default function CourseNote({ note }: { note: NoteBody }) {
  return (
    <div className="flex flex-col gap-2.5">
      {note.entries.map((entry) => (
        <div key={`${entry.label}-${entry.value}`} className="flex flex-col gap-0.5">
          <p className="text-[11px] font-semibold text-fg-muted">{entry.label}</p>
          <p className="text-[12.5px] leading-relaxed text-fg-secondary">{entry.value}</p>
        </div>
      ))}

      {note.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {note.flags.map((flag) => (
            <span
              key={flag}
              className="rounded border border-border-primary px-1.5 py-0.5 text-[11px] text-fg-secondary"
            >
              {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
