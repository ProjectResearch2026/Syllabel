<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

> **重要**: コードを書く前に必ず設計書を参照し、その内容に準拠すること。設計書は `docs/design.md`(目次・改訂履歴)と `docs/design/01-07`(本文)に分かれており、§番号とファイルの対応は `docs/design.md` の「0.3 本書の構成」にある。

# フロントエンド開発ガイド

## プロジェクト概要

龍谷大学の学生向け「履修登録支援AIチャットボット」のフロントエンド。成績表PDFを取り込み、学生個人の状況(学年・課程・修得済み科目)に応じた履修提案とシラバス検索を提供する。

- **プロトタイプ**として開発中。本番運用レベルは目指さない
- 個人情報保護が最優先設計原則。学生データはブラウザのメモリにのみ保持し、サーバーへ永続保存しない

## 技術スタック

| 技術 | バージョン | 用途 |
|---|---|---|
| Next.js | 16.4.1 | Webフレームワーク(App Router) |
| React | 19.2.9 | UIライブラリ |
| TypeScript | ^5 | 言語 |
| Tailwind CSS | ^4 | スタイリング |
| Zustand | — | クライアント状態管理(永続化オフ) |
| pdfjs-dist | — | 成績表PDFのクライアント側解析 |
| lucide-react | ^1.23.0 | アイコン |
| react-markdown | ^10.1.0 | AI回答のMarkdown描画(+ remark-gfm / remark-breaks) |

## ディレクトリ構成

```
frontend/
├── app/                            # Next.js App Router
│   ├── page.tsx                    # / 成績表の取り込み(PC・モバイル共通)
│   ├── import/page.tsx             # /import 旧ルート。/ へ転送するだけ
│   ├── mydata/page.tsx             # /mydata 学生データ確認
│   ├── proposal/page.tsx           # /proposal 時間割(履修提案)・AI
│   ├── syllabus/
│   │   ├── page.tsx                # /syllabus シラバス一覧・検索
│   │   └── [code]/page.tsx         # /syllabus/[code] 講義詳細
│   ├── privacy/page.tsx            # /privacy プライバシーポリシー
│   ├── globals.css
│   └── layout.tsx
├── components/                     # アプリ共通コンポーネント
│   ├── Header.tsx                  # PC のヘッダー
│   ├── BottomDock.tsx              # モバイルのボトムドック(Ask Bar + タブ)
│   ├── ai/                         # 会話の部品・モバイルの AI シート
│   └── pc/                         # PC の AI パネル
├── lib/                            # ユーティリティ・API通信
│   ├── api_base.ts                 # backend の宛先解決(§6.1)
│   ├── syllabus-api.ts             # 読み取り専用APIクライアント(JSON)
│   ├── chatApi.ts                  # SSEクライアント(チャット・履修提案)
│   ├── programs.ts                 # 課程名→課程コード・入学年度の算出(§4.4.2)
│   ├── syllabusUI.ts               # 検索画面の状態とタグ突合
│   ├── openbd.ts                   # 書影の取得(openBD。唯一の学外API。§6.4)
│   └── timetable.ts
└── package.json
```

コンポーネントはページ単位で `app/<page>/_components/` に配置する(例: `app/syllabus/_components/CourseCard.tsx`)。

**PC とモバイルで同じ URL に同じ役割の画面を置く**(design.md §8)。各 `page.tsx` が PC 用とモバイル用の組み立てを並べて置き、CSS(`md:hidden` / `hidden md:flex`)で出し分ける。`/` は取り込み、`/proposal` は時間割で、PC のヘッダーとモバイルのボトムドックは同じ3つの行き先(`/proposal` / `/syllabus` / `/mydata`)を持つ。**モバイルだけ別のルートに画面を置かない** — 以前はモバイルの `/` が時間割で、同じリンクが端末によって別の画面を開いていた。

## 命名規則

- **ファイル名**: スネークケース(`parse_grade_report.ts` など)
  - ただし Next.js の規約上必要なファイル(`page.tsx`、`layout.tsx`)と React コンポーネントファイル(`.tsx`)はパスカルケースでも可
- **コンポーネント名**: パスカルケース
- **変数・関数名**: キャメルケース

## コミットルール

```
<prefix>: <短い要約(日本語)>
```

| prefix | 用途 |
|---|---|
| `add` | 新規追加(機能・ファイル・設定) |
| `fix` | 不具合修正 |
| `update` | 既存機能の改善・変更(破壊的変更なし) |
| `style` | フォーマット・見た目のみの変更 |

例: `add: シラバス検索フォームに年度選択を追加`

## 状態管理

Zustand store は次の6本で、**すべて永続化機能を意図的にオフ**にする。ページリロード・タブクローズで完全消失することが要件(プライバシー要件)。

- `student.ts` — 学生プロファイル(学年・課程・既修得科目)
- `chat.ts` — 対話履歴(提案チャット・シラバスチャット・講義単位チャット)
- `chatHistory.ts` — 「最近のチャット」に退避した過去の会話
- `proposal.ts` — 履修提案の受信状態
- `syllabusUI.ts` — シラバス検索の絞り込み(タグ・区分・分野)と一覧のクエリの写し
- `ai.ts` — AI シートの表示状態

サーバーから取得するデータ(シラバス検索結果など)はキャッシュライブラリを入れず、サーバコンポーネントの `fetch` と `GET /api/curricula` の ETag(design.md §6.1.2)に委ねる。

## バックエンドとの通信

フロントエンドはバックエンドのみと通信する。**既存シラバスバックエンド(`api-clean`)を直接呼ぶことはできない**(公開されておらず、backend が中継する)。

**公開パスは `/syllabel/api/*` であり `/api/*` ではない。** `next.config.ts` の `basePath` はページとアセットの生成先しか変えず `fetch()` のパスには前置されないため、呼び出し先に `/syllabel` を自分で含める(design.md §3.5.2、§6.1)。

宛先の解決は `lib/api_base.ts` の `apiBase()` に集約する。**直接URLを書かない。**

| 呼び出し元 | 宛先 |
|---|---|
| ブラウザ(クライアントコンポーネント) | ゲートウェイと同一オリジンの `/syllabel/api/...`(相対パス) |
| サーバ側描画(RSC / `page.tsx` の `async` 関数) | backend のオリジンを直に引く(`BACKEND_ORIGIN`)。ゲートウェイを経由しないため `/syllabel` は付かない |

`lib/syllabus-api.ts` は双方から import されるため、宛先をモジュール読み込み時に固定してはならない。

| エンドポイント | 形式 | 用途 |
|---|---|---|
| `POST /api/proposal` | SSE | 履修提案を生成 |
| `POST /api/chat/proposal` | SSE | 履修提案チャット |
| `POST /api/chat/syllabus` | SSE | シラバス全体チャット |
| `POST /api/chat/syllabus/{code}` | SSE | 講義単位チャット |
| `GET /api/syllabi` | JSON | シラバス検索 |
| `GET /api/syllabi/{code}` | JSON | シラバス詳細 |
| `GET /api/masters` | JSON | 検索絞り込み用マスタ |
| `GET /api/curricula/{program}/{year}` | JSON | 履修要項データ |
| `POST /api/requirements` | JSON | 卒業要件の充足判定(要件枠ごとの修得済み・不足単位) |
| `GET /api/course-targets?year=&faculty=` | JSON | シラバスコード → 対象課程（タグの履修可否判定用） |

**backend 以外に1つだけ外部の口がある。** 講義詳細の書影と書誌の詳細(内容紹介・目次・ページ数)は openBD(`https://api.openbd.jp/v1/get`、認証不要)から ISBN で引く(`lib/openbd.ts`、design.md §6.4)。**宛先が固定の学外サービスなので、ここだけは `apiBase()` を通さず URL をモジュール内に持つ。** 規則は3つ。**1科目ぶんを1リクエストにまとめる**(`isbn` はカンマ区切りで複数取れ、応答は要求した順の配列)、**失敗は空の対応表に畳んで講義詳細を落とさない**(3秒で打ち切る。サーバ側描画なのでこの待ちがそのままページの表示を止める)、**書影が引けない本のほうが多い前提で作る**(版元ドットコム登録分にしか書影が無く、指定図書の多くは空文字で返る)。**学生データは送らない**(送るのは ISBN だけ。画像を引くときは `referrerPolicy="no-referrer"` で閲覧中の講義のURLを渡さない)。

**書名を押すと詳細が開くのは openBD から引けた本だけ**で、開閉は `<details>` で組む(`BookList.tsx`)。**開閉のためだけに講義詳細をクライアントコンポーネントにしない。** パネルの中の外部リンクは版元ドットコム(`https://www.hanmoto.com/bd/isbn/<ISBN-13>`)で、**openBD が書誌を返した本には必ずページがある**(未登録の ISBN は 404)。ISBN-13 は生値から作らず `summary.isbn` を使う。**`<summary>` に `<p>` を入れてはならない** — 受け取れるのは phrasing content だけで、ブラウザが手前のタグを閉じて木が崩れる。

SSEは `fetch` + `ReadableStream` で受信し、受信したchunkを逐次 React state に反映する。書式は `data: <JSON>` の1行1イベントで、イベント名は design.md §6.1.1 に従う(`lib/chatApi.ts`)。

| 用途 | イベント |
|---|---|
| チャット系(`/api/chat/*`) | `{"delta": "..."}` / `{"error": "..."}` / `{"done": true}` |
| 履修提案(`/api/proposal`) | `{"snapshot": {...}}` / `{"result": {...}}` に加えて `error` / `done` |

チャット系リクエストには**学生プロファイルと対話履歴を毎回含める**(サーバー側で永続化しないため)。

## AIの回答の描き方

**AIの回答は Markdown として描く**(design.md §4.1.5)。モデルは太字・箇条書き・表を混ぜて返すため、素のテキストとして描くと `**必修**` の `**` や `|---|---|` の罫線がそのまま学生に見える。

実体は `components/ai/MarkdownText.tsx` ひとつで、**吹き出しを描くのは `components/ai/ChatMessageList.tsx` の1か所だけである** — PCのパネル(`components/pc/AiChatPanel.tsx`)とモバイルの AI シート(`components/ai/MobileAiAssistant.tsx`)がこれを共有し、ヘッダー・定型の質問・入力欄も `components/ai/ChatParts.tsx` を共有する。**会話の吹き出しを新しく作らず、ここを通す。****吹き出しごとに描き方を写さない。** 字の大きさ・行間・色だけを `className` で外から与える。

**会話の中身も PC とモバイルで共有する**(design.md §4.1.5)。画面ごとの会話を `AiConversation`(`lib/ai.ts`)の形で作り — 時間割は `useProposalAssistant()`(`lib/useProposalConversation.ts`)、シラバス一覧は `useSyllabusConversation()`、講義詳細は `useCourseConversation()` — PC のパネルとモバイルのシートの双方に渡す。両者は同時に mount されるので、**送信中かどうかは各自の state ではなく吹き出しの `streaming` から導く**(片方から送ったときにもう片方が送信できてしまわないように)。モバイルの時間割のシートは提案の入力欄そのもので、提案前はハーフシートで希望条件を受け、送るとシートを閉じて時間割が埋まっていくところを見せる(design.md §8.3.1)。

- `react-markdown` + `remark-gfm`(表・取り消し線・チェックリスト)+ `remark-breaks`(段落内の単独改行)。**`remark-breaks` を外さない** — Markdown の既定では単独改行が消えるが、日本語の回答は1文ずつ改行して返ってくる
- **`rehype-raw` を入れてはならない。** 生のHTMLを描かないことで、モデルの出力がDOMに流れる口を塞いでいる
- **描くのはAI側の吹き出しだけ。** 学生が入力した文は Markdown として解釈しない
- **表のために吹き出しを広げない。** 幅は設計(`ui-ux/ui-design_*.pen`、280〜290px)どおりに保ち、表は中で横スクロールさせる
- Tailwind の preflight が `ul` / `ol` の記号と字下げを消すため、リストの見た目は `MarkdownText` の `components` で自分で付けている

履修提案の科目スキーマは design.md §5.3 に従う(`syllabusCode` / `title` / `day` / `period` / `term` / `slots` / `credits` / `category` / `courseCategory` / `subcategory` / `reason`)。**`category` は履修区分(必修など)で、区分は `courseCategory`、教養教育科目の分野は `subcategory`(どちらも履修要項の表記)である。** 時間割のセルは区分(教養教育科目は分野)を履修区分の前に出す(design.md §8.3.4)。履修区分だけではどの枠の必修か読めない。表示名は `lib/courseLabels.ts` にあり、シラバス一覧のタグと共用する。必須は `title` と `reason` だけで、**集中講義の曜日・時限や特定できないシラバスコードは null** で来る。

**`day` / `period` / `term` は1コマ目だけである。** 「後期 金4・金5」のように複数のコマを持つ科目の全コマは `slots` にある。時間割に置くときは `lib/timetable.ts` の `occupiedSlots()` を通し、`day` / `period` を直接使わない(1コマ目だけを見ていた頃は、金4・金5 の科目の金5 が空いて見えた)。`coursesToTimetable()` は複数コマの科目の**同じセル**を全部のマスに入れ、`toCourseList()` はそれを1科目1行に数える(マスごとに数えると単位が2倍になる)。**時間割表は PC・モバイルとも `coursesToSlotTable()` を使う**(design.md §8.3.4。PC は `TimetablePanel.tsx`、モバイルは `app/_components/TimetableGrid.tsx`)。1マスに複数の科目(3Q と 4Q)を持ち、クォーターの印を付け、曜日・時限の無い科目を `unscheduled` に分ける。**提案の科目は画面から落とさない** — 落とすと表の単位の和が「今期登録単位」と合わなくなる。1マス1科目の `coursesToTimetable()` はどの画面からも使っていない(以前のモバイルが使い、3Q と 4Q の科目の一方が消えていた)。シラバス一覧の曜日時限も api-clean の `slots` から `lib/schedule.ts` の `formatSlots()` で作る。

## 卒業要件枠の内訳

履修提案の画面はヘッダーカードの直下の帯(PC)・単位バーと提案する学期の下(モバイル。`MobileRequirementsStrip`)に要件枠ごとの充足状況を出す(design.md §8.3.5、`app/proposal/_components/RequirementsPanel.tsx`)。**充足した枠(修得済みの単位だけで充足した枠。見込みでは決めない — `SlotProgress.earnedShortfall`)は1つのまとめに畳み、足りない枠だけを1行に並べ、入りきらない分は横にスクロールさせる(折り返さない。PC はスクロールバーを隠し、端のぼかしと矢印ボタンで続きを示し、凡例は ⓘ に畳む。モバイルは指で送るので矢印を置かない。モバイルは時間割を大きく見せるため帯を横1列に詰め、充足した枠は件数のチップにして押すと名前が開く)。** 取得済み・今期登録・卒業残りの単位数は PC のヘッダー(`components/Header.tsx`)とモバイルの時間割の単位バーにある。**ヘッダーと帯の値は `lib/creditSummary.tsx` の `useCreditSummary()` から採る**(`CreditSummaryProvider` がルートのレイアウトで判定を1回だけ引く。各所で `useRequirements()` を呼ばない)。**数字は `lib/requirements.ts` の `useRequirements()` から採り、画面で足し算しない。** 枠への割り当て・溢れ・算入上限は backend の `requirements.py` が判定する(同じ枠の科目を不足より多く取った分は下流の枠に回る)。今期の時間割(提案の `courses`)の分は、それを修得したとみなして2回目を引いた差で出す。**登録済み(`registered`)の科目は今期の時間割に入れない**(成績表に `***` で載るのは終わった学期の成績発表待ちの科目で、提案する学期の科目ではない)。その単位は `SlotProgress.pending` として薄い紺(`bg-pending`)で別に積み、不足と卒業残りには含めない。提案の store の `courses` に追従するので、時間割を変える経路を足すときは store を書き換えればよい。`profile.program` は課程**コード**で送る(`fetchRequirements()` が差し替える)。

## 課程コードの解決

履修要項を引くキーは **(課程コード, 入学年度)** である(design.md §4.4.2)。`StudentProfile.program` に入るのは**課程名**なので、`GET /api/curricula` と `POST /api/proposal` を呼ぶ前に `lib/programs.ts` の `programCodeOf()` でコードに直す。入学年度は同モジュールの `resolveAdmissionYear()` で決める(成績表の入学日から読んだ `admissionYear` を優先し、無いとき=読み取れなかったときだけ学年から推定する)。課程一覧の正本は `curricula/admission-<年度>/` の課程ファイルである。

## プライバシー設計上の制約

以下はプライバシー要件から来る設計上の制約であり、変更してはならない。

- Zustand の `persist` ミドルウェアを使わない(localStorage・sessionStorage への書き込みを行わない)
- バックエンドに学生データを永続保存するAPIを追加しない
- 成績表PDFの解析はクライアント側(`pdfjs-dist`)で完結させ、PDFファイル自体をサーバーへ送信しない
- 学籍番号はPDFから意図的に抽出しない

## シラバス検索のタグ表示

検索結果に付すタグは、後述の4つの材料を**フロントエンド側で突き合わせて生成**する。design.md §6.1.3 / §8.2.1。

**タグは4つの軸に分かれている。** 卒業要件の枠が (区分 × 履修区分)、教養教育科目はさらに分野で決まるため、1軸に潰してはならない。

| 軸 | 値 |
|---|---|
| 状態 | `修得済み` |
| 区分 | `教養教育` / `専門基礎` / `専門応用` / `専門関連` |
| 分野 | 教養教育科目のみ。履修要項の `subcategory` から括弧と末尾の「科目」を除いた表示名(`人文科学系` など。`lib/courseLabels.ts` の `SUBCATEGORY_LABEL`) |
| 履修区分 | `必修` / `選択必修` / `選択` / `随意` |

| 状況 | 出すタグ |
|---|---|
| 修得済み(履修可否を問わない) | `修得済み` + 区分(+ 分野) |
| 履修可 × 未修得 × 自課程の設置科目 | 区分(+ 分野)+ 履修区分 |
| 履修可 × 未修得 × 他課程の設置科目 | `専門関連` のみ |
| 履修不可 / 可否を判定できない / 履修要項に無い | なし |

**バッジの配色と並びは `app/syllabus/_components/CourseTags.tsx` に1つだけ置く**(一覧PC・一覧モバイル・詳細で共用)。並びは 状態 → 区分 → 分野 → 履修区分。**色は履修区分にだけ使う**(区分・分野に色を割ると履修区分と競合する)。

**絞り込みの選択肢は `lib/syllabusUI.ts` の `TAG_CHIPS` / `CATEGORY_CHOICES` / `SUBCATEGORY_CHOICES`。** チップは履修区分、セレクトは区分と分野。**修得済みはチップに置かず、「修得済みを除く」スイッチ(`CompletedFilter.tsx`。既定 ON、ON は赤)で出し入れする**(修得済みだけを見たいときはマイデータで見られる。チップとスイッチで同じ軸を操作すると矛盾した組み合わせが選べる)。修得済みを除いたせいで0件のときは `emptyMessage()` がそう言う。**分野のセレクトは区分が `教養教育` のときだけ出し、区分を変えたら分野は `すべて` に戻す**(ストアの `setActiveCategory()` が戻す)。**URL のクエリには持たない**(履修要項との突合から決まる値であり、api-clean に投げる検索条件ではない)。

**曜日・時限(`day` / `period`)はこれと違って URL のクエリに持つ**(api-clean に投げる検索条件である)。時限のセレクトの選択肢は `periodChoices()`(時間割表と同じ 1〜5。範囲外の値が URL に付いていたときだけ足す)。**時間割の空きコマの「この時間に入る科目を探す」はこの2つを付けて一覧を開く**ので、セレクトを落とすと絞り込みが見えないまま効く状態になる。

**対象年次(`grade`)も URL のクエリに持つ。** 選択肢は `GRADE_CHOICES`(1〜4)。`page.tsx` は `period` / `grade` を api-clean の値域(1〜7 / 1〜4)の整数のときだけ検索条件にする(値域外を渡すと 422 で一覧が落ちる)。

**検索条件(キーワード・開講期など)は URL のクエリが正本。** ヘッダー・タブバーの「シラバス」は素の `/syllabus` ではなく `listHref(listQuery)` に向ける。`listQuery` は一覧を開いているあいだ `SyllabusQueryMemory` が URL から書き写す(design.md §8)。直書きの `/syllabus` に戻すと、時間割などを経由しただけで検索語が消える。

1. `GET /api/syllabi` の検索結果
2. `GET /api/curricula/{program}/{year}` の履修要項データ
3. Zustand `student.ts` の学生プロファイル
4. **対象課程** — 一覧は `GET /api/course-targets`(全件ぶん)、講義詳細は `GET /api/syllabi/{code}` の `programs` / `faculties`

**プロファイルが無いあいだは、チップもセレクトも押せるのに必ず0件になる。** タグが1つも付かないためで、その案内は `app/syllabus/_components/SyllabusProfileNotice.tsx` に1つだけ置き、PC・モバイルで共用する(チップの直下のバーと、絞り込みパネルの「区分」の注記)。**プロファイルがあるときは出さない** — 「取り込むと絞れます」は取り込んだ後には誤りになる。

タグは2段で決まる。**入口は `lib/useTagMap.ts` の `useTagMap()` だけで、これは `Map` ではなくタグを決める関数を返す。** 呼び出し側が2段目を掛け忘れられないようにするためで、`Map` に戻してはならない。

| 段 | 何をするか | どこ |
|---|---|---|
| 1 | 履修要項と突き合わせてタグの**候補**を作る | `lib/syllabusUI.ts` の `buildTagMap()` |
| 2 | **その学生がそのクラスを履修登録できるか**で候補を落とし、最終のタグに決める | `lib/eligibility.ts` の `canRegister()` → `lib/syllabusUI.ts` の `resolveTags()` |

注意点が4つある。

- **`syllabusCodes` は配列である。** 1科目に複数のクラスが対応するため、すべてのコードに同じ候補を付ける
- **履修できないクラスにはタグを出さない。** 履修要項は科目の単位で書かれており履修可否を持たない。判定の正本はシラバスの対象課程で、規則は3分岐(学生の課程が `programs` に入る → 可 / `programs` が空で `faculties` に先端理工学部が入る → 課程指定なしで可 / それ以外 → 不可)。**修得済みだけはこの判定を掛けない**(成績の事実であり、これから履修できるかとは無関係)
- **対象課程が取れなかったコードにもタグを出さない。** 判定できないものについて何も主張しないという方針である。**空配列を渡して代用してはならない** — 空配列は「課程指定なし（＝履修可）」を意味するので、不明なものを全部履修可と扱ってしまう。`undefined` を渡して区別する
- **`own` が false の科目に履修区分を出さない。** その `type` は導出元の課程にとっての区分であり、閲覧している学生にとっての区分ではない。その学生にとっての区分は**専門関連科目**なので `専門関連` だけを出す。**`own` を履修可否の代理指標として使ってはならない**(履修できる他課程科目まで落ちる)

**絞り込みは検索結果の全件に効く。** タグは学生プロファイルとの突合で決まるため api-clean の検索条件にできず、**絞り込んだ結果をサーバへ送ることもできない**（「修得済みのコード一覧」はその学生の成績そのもの。要件§5）。したがって振り分けはクライアントで閉じる。

| 何を | どこから |
|---|---|
| 検索結果 | `searchCourses()` が**条件に当たる全件**を返す（500件ずつ辿る。30件ずつのページ送りはしない。並びは api-clean の返すシラバスコード順で、画面に並び順の表示は出さない） |
| 対象課程（全件ぶん） | `fetchCourseTargets()` → `GET /api/course-targets`（gzip 約4KB。ETag が効く）。**引けなければ null にしてタグを出さずに続ける** — この口の失敗で一覧を落としてはならない |
| 担当教員名（表示中の行ぶん） | `fetchInstructorMap()` を**ブラウザから**呼ぶ（どの行が表示されるかを知っているのはブラウザだけ）。**取得は科目コードごとに1回にまとめる** — PC 用とモバイル用が同時に mount されており、まとめないと同じ詳細を2回ずつ引く |

**絞り込み・ページの切り出し・件数は `lib/useTaggedResults.ts` に集約し、PC とモバイルで共用する。** ページ送りは絞り込み後の並びに対して行い、`offset` は URL に残す（詳細画面から戻ったときに位置を保つため）。**絞り込みを変えたら `offset` を消す**（`lib/useFilterControls.ts`）。消さないと前の絞り込みでのページ位置が残る。**URL の `offset` は `page.tsx` で 0 以上の整数に限ってページの先頭に切り下げ、絞り込み後の件数を超えた分は `useTaggedResults()` が最後のページに丸める**（件数表示とページ送りは丸めた値を使う）。

講義詳細ページはシラバス本体を持っているので追加の取得は要らない。

**課程名の比較は `lib/programs.ts` の `isSameProgram()` を通す。** 課程コード `06` は入学年度で改称され(環境生態工学課程 / 環境科学課程)、api-clean は両方を別々の課程として持つため、文字列の一致では取り違える。

**科目名の突合は `lib/courseTitle.ts` の `normalizeTitle()` を通す。** 大学のデータ自体が表記を混在させており、「仏教の思想A」は履修要項と api-clean が半角 `A`、Web シラバス検索ページが**全角 `Ａ`** である。成績表由来の科目名にも全角英数字や空白が混じるため、完全一致では外れる。規則は **NFKC 正規化 + 空白除去**で、**backend の `app/curricula/titles.py` の `normalize_title()` と同じに保つこと**。片方だけ直すと「残り単位では修得済みなのにタグが出ない」というねじれが起きる。

**検索欄の入力は `lib/useSearchInput.ts` を通して URL の `q` に反映する(PC・モバイル共用)。** `q` を変えるとサーバ側描画と api-clean への全件取得がやり直されるため、**IME の変換中は反映せず、確定後・英数字は入力が 300ms 止まってから、Enter は即時**に反映する。1文字ごとに反映していた頃は「でーたべーす」の入力だけで api-clean へ26本のリクエストが出ていた。

**検索ボックスの科目名は `lib/titleSearch.ts` の `matchesTitle()` で手元で照合する。** api-clean の `q` は正規化の無い `ILIKE` で、「プログラミング基礎演習1」(登録は `Ⅰ`)や「仏教の思想Ａ」(登録は半角 `A`)が0件になっていた。`searchCourses()` は条件に当たる全件を引いてから照合し、0件のときだけ教員名で引き直す。全角・半角、`Ⅰ` 由来のローマ数字、ひらがな・カタカナ、空白・中黒の違いを畳み、空白で区切った語は AND で効く。**`normalizeTitle()` と混ぜない**(あちらは突合用で backend と同じ狭い規則に保つ)。**backend の `app/agents/title_search.py` と同じ規則に保つこと**(シラバスチャットの検索ツールは backend が照合する)。

**教員名は `lib/instructorName.ts` の `spellInstructorName()` で登録表記に組み立ててから引き直す。** api-clean の `instructor` は**登録された表記のままの部分一致**で、正規化を持たない(design.md §6.1 / §6.2)。教員名は全角スペース区切りで登録されているため、「山田 太郎」(半角)も「山田太郎」(区切りなし)も0件になっていた。**照合するのは api-clean であり一覧は教員名を返さない**ので、`normalizeTitle()` のように手元で正規化して突き合わせる手は使えない。入力の空白を取り除き、**先頭から1文字ずつ伸ばしながら api-clean に当たるかを確かめて**、繋げて外れたら区切り(全角 → 半角)を挟む。**姓の長さや区切りの数を決め打ちしない** — 姓の長さを1〜4文字で試していた頃は、オーガスティン　ジョナサン(姓7文字)やドラグナ　ラルカ　マリア(区切り2つ)を区切りなしで引けなかった。**組み立てるのは入力どおりの語が空振りしたときだけ**にする(姓のみ・全角区切りのフルネームは1リクエストで当たる)。**backend の `app/agents/instructor_name.py` の `spell_instructor_name()` と同じ規則に保つこと**(検索画面はこちら、シラバスチャットは backend が引くため、食い違うと「検索では出るのにチャットでは見つからない」というねじれが起きる)。

## PDF解析

- `pdfjs-dist` でテキストレイヤーを抽出。**legacy ビルド(`pdfjs-dist/legacy/build/pdf.mjs` と同ビルドの worker)を使い、`page.getTextContent()` は使わずに `streamTextContent()` を `getReader()` で読む**(design.md §4.1.3)。通常ビルドは `Map.prototype.getOrInsertComputed` を持たないブラウザ(Chromium 141 など)で、`getTextContent()` は ReadableStream の非同期反復を持たない Safari(iPhone を含む)で、どちらも取り込みの最初に落ちる
- 龍谷大学成績表レイアウト前提のルールベースパーサーを実装
- 評価記号(`T`/`N`/`G`/`D`/`J`/`M`)と数値スコアを認識し合否を判定。100点満点の場合は60点以上を合格
- 解析失敗時は、もう一度選ぶか、デモの学生で試すよう案内する。**手入力のフォームは置かない**(要件§4.1。科目を一から入力させるのは現実的でなく、成績表なしで試すときはデモの学生をマイデータで直す)
- **評価(点数・評価記号)はパーサーの中だけで使う**(合否と修得学期の判定)。`Course` に持たせず、画面にも backend にも出さない(要件§4.2、design.md §5.2.1)。画面は履修状態(合格・未修得・発表待ち)を出す

**取り込むのは成績表に載っている全科目であり、履修状態(`status`)を付けて渡す**(要件§4.2)。不合格・履修辞退は【再履修の対象】として履修提案に渡すため、**パーサーで落としてはならない**(設計書 §6.1)。卒業要件の単位計算に数えるのは `passed` だけで、その絞り込みは単位を数える側(`CreditBar` / 取り込み確認 / マイデータ)と backend の `requirements.py` が行う。

読み取りで気をつける点が3つある。いずれも実データで踏んだもので、**評価列だけを見ると未修得・登録済みの科目が丸ごと落ちる。**

- **未修得の科目は評価列が空**である。成績は履修グリッドのセルにだけ入る(例: 心理学入門 58 / 環境としての情報技術 J)。評価列が空のときはグリッドの最新のセルに退避する。**グリッドにもセルが無ければ未履修**(科目名と単位だけが刷られている)なので除外する
- **再履修した科目はグリッドに成績セルが複数並ぶ。** 最初のセルは落とした回なので、修得学期として採ってはならない。評価列はその科目の最終結果なので、評価と同じ値のセルがその科目を修得した学期である
- **登録済みで成績が未確定の科目はグリッドに `***`(登録科目)/ `*`(継続履修中)が入る。** 成績ではないので `isScore()` を通らず、従来は科目ごと捨てていた。`status: "registered"` として取り込み、単位にも【再履修の対象】にも数えない(`isUnearned()` は不合格・履修辞退だけを指す)。履修提案では候補から外れる

**成績表からは学期の判断材料も読む**(design.md §5.2.1)。右上の**作成月日**(年はヘッダの年度から補う)と「**在籍年数 / 休学年数 / 在学年数**」を読む。**次に登録する学期(`lib/targetTerm.ts`)は作成日の月で決める**(4月 → 同年度前期、5〜9月 → 同年度後期、10〜3月 → 翌年度前期)。**在籍年数は学期の決定に使わない** — その年度を丸1年と数えるため(2024年4月入学で 2026年9月作成は 3.0)、「入学年度の前期+在籍年数×2学期」は9月作成の成績表で1学期先を指す(実際に 2026年度後期のはずが 2027年度前期になった)。**成績の有無から学期を推定してはならない** — 成績が1件も付かなかった学期があると1年前の学期を指す。**基本情報欄は見出し「入学日」からの相対位置で読む**(帳票は作成年度によって全体が縦にずれる)。

**提案する学期は `lib/targetTerm.ts` の `useTargetTerm()` だけから引く。** 提案するのは取り込んだ成績表の次の学期であり、**学生には選び直させない**(画面の `app/proposal/_components/TargetTermLabel.tsx` は表示だけ)。`POST /api/proposal` の `targetTerm` と画面の表示が同じ値を見る。成績表から作成日を読めなかったときだけ今日の日付で決め、画面でその旨を添える(デモは `demo.target` に固定)。ブラウザの今日の日付から学期を作って表示してはならない(提案の対象と食い違う)。

## 龍谷祭デモ向け機能

- ダミー学生は `lib/dummy/profiles.json` の48件(課程6 × 提案を受ける学年4 × 提案する学期2)。**手で書き換えず** `backend/scripts/generate_dummy_profiles.py` で作り直す(履修要項と api-clean の開講実績から組み立てる。検査は `backend/tests/test_dummy_profiles.py`)。約100KBあるので、選んだときに `loadDemoProfile()` が `import()` する
- 選ぶ部品は `app/_components/DemoPicker.tsx` ひとつで、取り込み画面(PC・モバイル)とマイデータ(PC)・設定(モバイル)で共用する。学期の初期値は `defaultDemoTerm()`(3〜8月は前期、9〜2月は後期)
- デモの学生は `profile.demo` を持ち、**提案する学期は `demo.target` に固定する**(`lib/targetTerm.ts`。今日の日付から決めない)。`grade` は提案する学期の学年である
- **別の学生に差し替えるときは `lib/replaceStudent.ts` の `useReplaceStudent()` を通す**(成績表の取り込み・デモの学生の切り替え)。前の学生の履修提案と会話、シラバス検索の絞り込みと検索条件(`useSyllabusUIStore` の `reset()`)を捨ててからプロファイルを入れる。`setProfile` を直接呼ぶと、前の学生の時間割が新しい学生の時間割として残る。マイデータの訂正も、内容が変わったときはこれを通す(下記)
- 1年前期(`isFreshmanDemo()`)は成績が1件も無い。取り込み確認・完了の画面では「取り込み」と言わず「新入生として始める」とする
- 展示用端末では「PDF取り込み」を無効化する

## マイデータの訂正

design.md §8.4。フォームは `app/_components/ProfileEditForm.tsx` ひとつで、PC(`PcMyDataPage.tsx`)とモバイル(`MobileSettingsPage.tsx`)が共用する。

- **科目の追加は履修要項から選ぶ。** 候補は `fetchCurricula()` の `courses`(課程・入学年度はフォームで選んでいる値から決める)。科目名と単位数は候補の値で固定し、照合は `matchesTitle()`。**科目名を自由に入力させない** — 履修要項に無い科目名は卒業要件の判定で計上されない
- **制限はそれだけにする。** 成績表から取り込んだ科目の削除・履修状態の変更、学年・課程の訂正は止めない(パーサーの誤りを直す手段)
- **同じ科目を2件にしない。** 一覧にある科目は候補から外し、結果が変わったら既存の行の履修状態を変える
- **保存はフォームが触らない項目(`issuedOn` / `enrollment` / `demo`)を保つ。** プロファイルを作り直さず、元のプロファイルに変更分を重ねる
- **内容が変わったら、確認してから `useReplaceStudent()` で入れる**(提案と会話を捨てる)。何も変わっていなければ捨てずに閉じる
