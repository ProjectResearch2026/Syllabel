import { Info } from "lucide-react";

/**
 * 備考(`note`)。**改行を保ち、`【…】` の見出しはタグとして出す。**
 *
 * 実データは `【抽選登録科目】\n6 社会科学系\nY:ALL\nT:2015～` のような複数行で、
 * 以前は1行に潰して描いていたため「【抽選登録科目】6 社会科学系 Y:ALL…」と
 * 読めない並びになっていた。**抽選登録の有無は履修に直接関わる**ため目立たせる。
 */
export default function CourseNote({ note }: { note: string }) {
  const lines = note.split("\n").map((line) => line.trim()).filter(Boolean);
  const tags: string[] = [];
  const rest: string[] = [];

  for (const line of lines) {
    const bracketed = line.match(/^【(.+?)】(.*)$/);
    if (bracketed) {
      tags.push(bracketed[1]);
      if (bracketed[2].trim()) rest.push(bracketed[2].trim());
    } else {
      rest.push(line);
    }
  }

  return (
    <section className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Info size={15} className="shrink-0 text-[#B45309]" aria-hidden="true" />
        <h2 className="text-xs font-bold text-[#92400E]">備考</h2>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[#FCD34D] bg-white px-2 py-0.5 text-[11px] font-bold text-[#B45309]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {rest.map((line, i) => (
            <li key={`${i}-${line}`} className="text-xs leading-relaxed text-[#92400E]">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
