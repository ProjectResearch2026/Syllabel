import { Book } from "lucide-react";
import type { Textbook } from "@/lib/syllabus-api";

/**
 * テキスト・参考文献（ui-design_pc.pen 06_講義詳細_教材 Card_テキスト・参考文献）。
 *
 * **api-clean は書誌(`textbooks`)を返しているのに、これまで自由記述
 * (`textbook_note` / `reference_note`)しか出していなかった。** 2026年度で
 * テキスト 607 件・参考文献 1,206 件が画面に出ていなかったことになる。
 * 書名・著者・出版社・価格まで出す。
 *
 * テキストは赤、参考書はグレーの背表紙で区別する。**区別は色と小さなタグだけに
 * 留める**（「テキスト」「参考書」で節を分けると、1冊ずつの科目で見出しばかりになる）。
 *
 * **書影は openBD から引けたものだけ出す**（`lib/openbd.ts`、design.md §6.4）。
 * 引けなかった本は今までどおり背表紙アイコンで、**枠の大きさは書影と同じにする**
 * （書影の有無で行の高さが変わると、1科目に何冊も並ぶ書誌が階段状になる）。
 */
function BookRow({ book, cover }: { book: Textbook; cover?: string }) {
  const isMain = book.role === "main";
  const meta = [book.author_raw ?? book.author, book.publisher_raw ?? book.publisher]
    .filter(Boolean)
    .join(" / ");

  return (
    <li className="flex gap-3.5 border-b border-card-divider pb-3.5 last:border-b-0 last:pb-0">
      <span
        className={`grid h-15 w-11 shrink-0 place-items-center overflow-hidden rounded border border-card-border ${
          isMain ? "bg-accent-light" : "bg-surface-gray"
        }`}
        aria-hidden="true"
      >
        {cover ? (
          // 書影は隣の書名の繰り返しなので装飾扱いにする（alt は空）。
          // next/image を使わないのは、最適化を挟むと sharp と remotePatterns の
          // 設定がコンテナに要るためで、プロトタイプでは釣り合わない。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            // 閲覧中の講義のURLを openBD に渡さない（要件§5）
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <Book size={18} className={isMain ? "text-accent" : "text-fg-icon"} />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded border px-[7px] py-0.5 text-[10.5px] font-bold ${
              isMain
                ? "border-tag-required-border bg-tag-required-bg text-tag-required-fg"
                : "border-tag-optional-border bg-tag-optional-bg text-tag-optional-fg"
            }`}
          >
            {isMain ? "テキスト" : "参考書"}
          </span>
          {book.price != null && (
            <span className="text-[11px] font-semibold text-fg-muted">
              {book.price.toLocaleString()}円（税込）
            </span>
          )}
        </div>
        <p className="text-[13.5px] font-bold leading-5 text-fg-primary">{book.title}</p>
        {(meta || book.isbn) && (
          <p className="text-xs leading-[18px] text-fg-secondary">
            {meta}
            {meta && book.isbn && "　"}
            {book.isbn && `ISBN ${book.isbn}`}
          </p>
        )}
      </div>
    </li>
  );
}

export default function BookList({
  books,
  textbookNote,
  referenceNote,
  covers,
}: {
  books: Textbook[];
  textbookNote: string | null;
  referenceNote: string | null;
  /** ISBN（api-clean の生値）→ 書影URL。引けなかった本は入らない */
  covers: Record<string, string>;
}) {
  // テキストを先に、あとは api-clean の並び順のまま
  const sorted = [...books].sort(
    (a, b) =>
      Number(b.role === "main") - Number(a.role === "main") || a.order_index - b.order_index,
  );
  const notes = [textbookNote?.trim(), referenceNote?.trim()].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-3.5">
      {sorted.length > 0 && (
        <ul className="flex flex-col gap-3.5">
          {sorted.map((book) => (
            <BookRow
              key={book.id}
              book={book}
              cover={book.isbn ? covers[book.isbn] : undefined}
            />
          ))}
        </ul>
      )}
      {notes.map((note, i) => (
        <p key={i} className="whitespace-pre-wrap text-[12.5px] leading-[21px] text-fg-secondary">
          {note}
        </p>
      ))}
    </div>
  );
}
