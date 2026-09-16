/**
 * シラバスの自由記述を描く。改行を保ち、URL はリンクにする。
 *
 * 授業外学習などに参考サイトの URL が素で書かれている科目があり、
 * そのままでは押せず、選択してコピーするしかない。
 */

// 末尾の句読点・閉じ括弧は URL に含めない(本文の区切りであることが多い)
const URL_PATTERN = /https?:\/\/[^\s、。）)」』]+/g;

export default function RichText({ children }: { children: string }) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of children.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(children.slice(cursor, start));
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
  if (cursor < children.length) nodes.push(children.slice(cursor));

  // 1行が長すぎると読み返しの目が迷う。日本語で40字程度に収める
  return <p className="max-w-[44em] whitespace-pre-wrap leading-[1.9]">{nodes}</p>;
}
