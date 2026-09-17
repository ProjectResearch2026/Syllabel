import { Book, ChevronRight, ExternalLink } from "lucide-react";
import type { Textbook } from "@/lib/syllabus-api";
import type { BookInfo } from "@/lib/openbd";

/** 詳細パネルの1項目（内容紹介・目次）。値が無ければ何も出さない */
function BookSection({
  title,
  body,
  preserveBreaks = false,
}: {
  title: string;
  body: string | null;
  preserveBreaks?: boolean;
}) {
  if (!body) return null;
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-[11px] font-bold text-fg-muted">{title}</h4>
      <p
        className={`text-xs leading-[19px] text-fg-secondary ${
          preserveBreaks ? "whitespace-pre-wrap" : ""
        }`}
      >
        {body}
      </p>
    </section>
  );
}

/**
 * 書名を押したときに開く詳細（design.md §6.4）。
 *
 * **`<details>` で組む。** 開閉のためだけにこの木をクライアントコンポーネントに
 * するのは割に合わず、`<details>` はキーボード操作と支援技術への対応を素で持つ。
 *
 * **出すのは openBD にあった項目だけ。** 学術書は紹介文も目次も欠けることが
 * あり、空の見出しだけが並ぶことになる。**何も無くてもパネル自体は開く** —
 * 版元ドットコムへのリンクはどの本にも出せるので、そこから先を辿れる。
 */
function BookDetails({ book, info }: { book: Textbook; info: BookInfo }) {
  // 書誌事項は1行にまとめる。api-clean が持っていない値（ページ数・刊行年月・
  // シリーズ）だけを出し、著者・出版社・ISBN は行の下にある元の表示に任せる
  const facts = [
    info.series,
    info.pubdate,
    info.pages != null ? `${info.pages}ページ` : null,
  ].filter(Boolean);

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded border border-card-divider bg-surface-gray p-2.5">
      {facts.length > 0 && (
        <p className="text-[11px] font-semibold text-fg-muted">{facts.join("　/　")}</p>
      )}
      <BookSection title="内容紹介" body={info.description} />
      <BookSection title="目次" body={info.toc} preserveBreaks />
      <a
        href={info.detailUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-[11.5px] font-bold text-accent hover:underline"
      >
        版元ドットコムで見る
        <ExternalLink size={12} aria-hidden="true" />
        <span className="sr-only">（{book.title}。新しいタブで開く）</span>
      </a>
    </div>
  );
}

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
 * **書影と詳細は openBD から引けたものだけ出す**（`lib/openbd.ts`、design.md §6.4）。
 * 引けなかった本は今までどおり背表紙アイコンで、**枠の大きさは書影と同じにする**
 * （書影の有無で行の高さが変わると、1科目に何冊も並ぶ書誌が階段状になる）。
 * **書名が押せるのも引けた本だけ**で、引けなかった本は押しても何も出せない。
 */
function BookRow({ book, info }: { book: Textbook; info?: BookInfo }) {
  const isMain = book.role === "main";
  const meta = [book.author_raw ?? book.author, book.publisher_raw ?? book.publisher]
    .filter(Boolean)
    .join(" / ");

  // 書名とその下の書誌事項。開けるときは <summary> の中に入る。
  // **<p> ではなく <span> で組む** — <summary> が受け取れるのは phrasing content
  // だけで、<p> を入れるとブラウザが手前のタグを閉じて木が崩れる
  const heading = (
    <>
      <span className="block text-[13.5px] font-bold leading-5 text-fg-primary">
        {book.title}
      </span>
      {(meta || book.isbn) && (
        <span className="block text-xs leading-[18px] text-fg-secondary">
          {meta}
          {meta && book.isbn && "　"}
          {book.isbn && `ISBN ${book.isbn}`}
        </span>
      )}
    </>
  );

  return (
    <li className="flex gap-3.5 border-b border-card-divider pb-3.5 last:border-b-0 last:pb-0">
      <span
        className={`grid h-15 w-11 shrink-0 place-items-center overflow-hidden rounded border border-card-border ${
          isMain ? "bg-accent-light" : "bg-surface-gray"
        }`}
        aria-hidden="true"
      >
        {info?.cover ? (
          // 書影は隣の書名の繰り返しなので装飾扱いにする（alt は空）。
          // next/image を使わないのは、最適化を挟むと sharp と remotePatterns の
          // 設定がコンテナに要るためで、プロトタイプでは釣り合わない。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={info.cover}
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

        {info ? (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-1 rounded-sm marker:content-none hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <ChevronRight
                size={14}
                className="mt-0.5 shrink-0 text-fg-icon transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">{heading}</span>
            </summary>
            <BookDetails book={book} info={info} />
          </details>
        ) : (
          heading
        )}
      </div>
    </li>
  );
}

export default function BookList({
  books,
  textbookNote,
  referenceNote,
  bookInfo,
}: {
  books: Textbook[];
  textbookNote: string | null;
  referenceNote: string | null;
  /** ISBN（api-clean の生値）→ openBD の補足情報。引けなかった本は入らない */
  bookInfo: Record<string, BookInfo>;
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
              info={book.isbn ? bookInfo[book.isbn] : undefined}
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
