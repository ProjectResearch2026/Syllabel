import type { Textbook } from "@/lib/syllabus-api";

/**
 * テキスト・参考文献。
 *
 * **api-clean は書誌(`textbooks`)を返しているのに、これまで自由記述
 * (`textbook_note` / `reference_note`)しか出していなかった。** 2026年度で
 * テキスト 607 件・参考文献 1,206 件が画面に出ていなかったことになる。
 * 書名・著者・出版社・価格まで出す。
 */
function BookGroup({ title, books }: { title: string; books: Textbook[] }) {
  if (books.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold tracking-wide text-fg-muted">{title}</p>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {books.map((book) => {
          const meta = [book.author_raw ?? book.author, book.publisher_raw ?? book.publisher]
            .filter(Boolean)
            .join(" / ");
          return (
            <li key={book.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
              <p className="text-[13px] font-semibold leading-snug text-fg-primary">{book.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-muted">
                {meta && <span>{meta}</span>}
                {book.price != null && <span>¥{book.price.toLocaleString()}</span>}
                {book.isbn && <span className="font-mono">ISBN {book.isbn}</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function BookList({
  books,
  textbookNote,
  referenceNote,
}: {
  books: Textbook[];
  textbookNote: string | null;
  referenceNote: string | null;
}) {
  const sorted = [...books].sort((a, b) => a.order_index - b.order_index);
  const main = sorted.filter((b) => b.role === "main");
  const reference = sorted.filter((b) => b.role !== "main");
  const notes = [textbookNote?.trim(), referenceNote?.trim()].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-4">
      <BookGroup title="テキスト" books={main} />
      <BookGroup title="参考文献" books={reference} />
      {notes.map((note, i) => (
        <p key={i} className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-secondary">
          {note}
        </p>
      ))}
    </div>
  );
}
