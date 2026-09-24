"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * AIの回答を Markdown として描く(design.md §4.1.5)。
 *
 * モデルは太字・箇条書き・表を混ぜて返す。バックエンドのプロンプトはそれを
 * 禁じていないし、比較(科目の並び)や条件列挙では表と箇条書きのほうが読みやすい。
 * 素のテキストとして描いていたため `**必修**` の `**` や `|---|---|` の罫線が
 * そのまま見えていた。
 *
 * 会話を描く4か所(モバイルのシート `AiMessageArea`、PCのパネル `AiChatPanel`、
 * モバイルの履修提案 `MobileProposalPage`、シラバス詳細のチャット欄 `SyllabusChatBox`)で**同じ描き方**を使う。字の大きさと色は吹き出しごとに違うので `className` で
 * 外から与え、ここでは Markdown の構造だけを持つ。
 *
 * 規則は3つ。
 * - **生のHTMLは描かない。** `react-markdown` は既定で HTML を素通しせず、
 *   `rehype-raw` を入れなければタグは文字として出る。モデルの出力を DOM に
 *   流す口を開けないため、入れない。
 * - **改行はモデルが書いたとおりに出す**(`remark-breaks`)。Markdown の既定では
 *   段落内の単独改行が消えるが、日本語の回答は1文ずつ改行して返ってくることが
 *   多く、消すと読みにくい。素のテキストだった頃の見た目もこちらに合う。
 * - **表は吹き出しの中で横スクロールさせる。** 吹き出しは 280〜290px 幅で
 *   設計されており(ui-design_*.pen)、表のために広げない。
 */
const components: Components = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through opacity-70">{children}</del>,

  // Tailwind の preflight が list-style を消すので、記号と字下げは自分で付ける
  ul: ({ children }) => (
    <ul className="list-disc space-y-1 pl-[1.25em] [&_ol]:mt-1 [&_ul]:mt-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-1 pl-[1.35em] [&_ol]:mt-1 [&_ul]:mt-1">{children}</ol>
  ),
  // GFM のチェックリストは記号と重なるので、行頭の点を消す
  li: ({ children, className }) => (
    <li className={className === "task-list-item" ? "list-none" : undefined}>{children}</li>
  ),
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} disabled className="mr-1 align-middle" />
    ) : null,

  h1: ({ children }) => <h1 className="text-[1.15em] font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[1.1em] font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="font-bold">{children}</h3>,
  h4: ({ children }) => <h4 className="font-bold">{children}</h4>,
  h5: ({ children }) => <h5 className="font-bold">{children}</h5>,
  h6: ({ children }) => <h6 className="font-bold">{children}</h6>,

  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border-primary pl-2.5 text-fg-secondary">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border-primary" />,

  code: ({ children }) => (
    <code className="rounded bg-surface-soft px-1 py-0.5 font-mono text-[0.92em]">{children}</code>
  ),
  // 囲みの中の `code` は地色と余白を pre 側に任せる(二重の枠にしない)
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md bg-surface-soft p-2.5 text-[0.92em] [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),

  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-[0.92em]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="border border-border-primary bg-surface-soft px-2 py-1 text-left font-bold whitespace-nowrap"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-border-primary px-2 py-1 align-top">
      {children}
    </td>
  ),
};

export default function MarkdownText({
  children,
  /** 吹き出しごとの字の大きさ・行間・色 */
  className,
  /** 受信中のカーソル。最後のブロックの末尾に続けて出す */
  caret = false,
}: {
  children: string;
  className?: string;
  caret?: boolean;
}) {
  // カーソルを兄弟要素にすると Markdown のブロックの下に落ちてしまうため、
  // 最後のブロックの ::after として文字の直後に出す
  const caretClass = caret
    ? "[&>:last-child]:after:ml-0.5 [&>:last-child]:after:animate-pulse [&>:last-child]:after:content-['▌']"
    : "";

  return (
    <div className={`space-y-2 break-words ${className ?? ""} ${caretClass}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
