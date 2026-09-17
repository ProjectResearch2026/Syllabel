import { unwrapWrappedLines } from "@/lib/syllabusText";

/**
 * シラバスの自由記述を描く。改行を保ち、URL はリンクにする。
 *
 * 授業外学習などに参考サイトの URL が素で書かれている科目があり、
 * そのままでは押せず、選択してコピーするしかない。
 *
 * ただし api-clean の本文は元の教務システムの固定幅で折り返されており、
 * 語の途中に改行が入っている。保つべきなのは書き手が入れた改行だけなので、
 * 折り返しぶんは `unwrapWrappedLines()` で畳んでから描く。
 */

// 末尾の句読点・閉じ括弧は URL に含めない(本文の区切りであることが多い)
const URL_PATTERN = /https?:\/\/[^\s、。）)」』]+/g;

export default function RichText({ children }: { children: string }) {
  const text = unwrapWrappedLines(children);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <a
        key={`${start}-${match[0]}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {match[0]}
      </a>,
    );
    cursor = start + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  // 1行が長すぎると読み返しの目が迷う。日本語で40字程度に収める
  return <p className="max-w-[44em] whitespace-pre-wrap leading-[1.9]">{nodes}</p>;
}
