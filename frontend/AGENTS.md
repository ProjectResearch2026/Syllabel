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
| Next.js | 16.2.10 | Webフレームワーク(App Router) |
| React | 19.2.4 | UIライブラリ |
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
│   ├── page.tsx                    # / トップページ(学生情報入力)
│   ├── mydata/page.tsx             # /mydata 学生データ確認
│   ├── proposal/page.tsx           # /proposal 履修提案・チャット
│   ├── syllabus/
│   │   ├── page.tsx                # /syllabus シラバス一覧・検索
│   │   └── [code]/page.tsx         # /syllabus/[code] 講義詳細
│   ├── privacy/page.tsx            # /privacy プライバシーポリシー
│   ├── globals.css
│   └── layout.tsx
├── components/                     # アプリ共通コンポーネント
│   ├── Header.tsx
│   └── BottomTabBar.tsx
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

Zustand store を2本使用する。**どちらも永続化機能は意図的にオフ**にする。ページリロード・タブクローズで完全消失することが要件(プライバシー要件)。

- `student.ts` — 学生プロファイル(学年・課程・既修得科目)
- `chat.ts` — 対話履歴(提案チャット・シラバスチャット)

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

実体は `components/ai/MarkdownText.tsx` ひとつで、**会話を描く3か所すべてが共有する** — モバイルのシート(`components/ai/AiMessageArea.tsx`)、PCのパネル(`components/pc/AiChatPanel.tsx`)、モバイルの履修提案チャット(`app/proposal/_components/MobileProposalPage.tsx`)。**会話の吹き出しを新しく作るときはここを通す。****吹き出しごとに描き方を写さない。** 字の大きさ・行間・色だけを `className` で外から与える。

- `react-markdown` + `remark-gfm`(表・取り消し線・チェックリスト)+ `remark-breaks`(段落内の単独改行)。**`remark-breaks` を外さない** — Markdown の既定では単独改行が消えるが、日本語の回答は1文ずつ改行して返ってくる
- **`rehype-raw` を入れてはならない。** 生のHTMLを描かないことで、モデルの出力がDOMに流れる口を塞いでいる
- **描くのはAI側の吹き出しだけ。** 学生が入力した文は Markdown として解釈しない
- **表のために吹き出しを広げない。** 幅は設計(`ui-ux/ui-design_*.pen`、280〜290px)どおりに保ち、表は中で横スクロールさせる
- Tailwind の preflight が `ul` / `ol` の記号と字下げを消すため、リストの見た目は `MarkdownText` の `components` で自分で付けている

履修提案の科目スキーマは design.md §5.3 に従う(`syllabusCode` / `title` / `day` / `period` / `term` / `slots` / `credits` / `category` / `reason`)。必須は `title` と `reason` だけで、**集中講義の曜日・時限や特定できないシラバスコードは null** で来る。

**`day` / `period` / `term` は1コマ目だけである。** 「後期 金4・金5」のように複数のコマを持つ科目の全コマは `slots` にある。時間割に置くときは `lib/timetable.ts` の `occupiedSlots()` を通し、`day` / `period` を直接使わない(1コマ目だけを見ていた頃は、金4・金5 の科目の金5 が空いて見えた)。`coursesToTimetable()` は複数コマの科目の**同じセル**を全部のマスに入れ、`toCourseList()` はそれを1科目1行に数える(マスごとに数えると単位が2倍になる)。**PC の時間割表は `coursesToSlotTable()` を使う**(design.md §8.3.4)。1マスに複数の科目(3Q と 4Q)を持ち、クォーターの印を付け、曜日・時限の無い科目を `unscheduled` に分ける。**提案の科目は画面から落とさない** — 落とすと表の単位の和が「今期登録単位」と合わなくなる。モバイルの `coursesToTimetable()` は1マス1科目のままである(§13)。シラバス一覧の曜日時限も api-clean の `slots` から `lib/schedule.ts` の `formatSlots()` で作る。

## 卒業要件枠の内訳

履修提案の画面(PC)は単位バーの下に要件枠ごとの充足状況を出す(design.md §8.3.5、`app/proposal/_components/RequirementsPanel.tsx`)。**数字は `lib/requirements.ts` の `useRequirements()` から採り、画面で足し算しない。** 枠への割り当て・溢れ・算入上限は backend の `requirements.py` が判定する(同じ枠の科目を不足より多く取った分は下流の枠に回る)。今期の時間割(提案の `courses` と登録済みの科目)の分は、それを修得したとみなして2回目を引いた差で出す。提案の store の `courses` に追従するので、時間割を変える経路を足すときは store を書き換えればよい。`profile.program` は課程**コード**で送る(`fetchRequirements()` が差し替える)。

## 課程コードの解決

履修要項を引くキーは **(課程コード, 入学年度)** である(design.md §4.4.2)。`StudentProfile.program` に入るのは**課程名**なので、`GET /api/curricula` と `POST /api/proposal` を呼ぶ前に `lib/programs.ts` の `programCodeOf()` でコードに直す。入学年度も同モジュールの `getAdmissionYear()` で学年から算出する。課程一覧の正本は `curricula/admission-<年度>/` の課程ファイルである。

## プライバシー設計上の制約

以下はプライバシー要件から来る設計上の制約であり、変更してはならない。

- Zustand の `persist` ミドルウェアを使わない(localStorage・sessionStorage への書き込みを行わない)
- バックエンドに学生データを永続保存するAPIを追加しない
- 成績表PDFの解析はクライアント側(`pdfjs-dist`)で完結させ、PDFファイル自体をサーバーへ送信しない
- 学籍番号はPDFから意図的に抽出しない

## シラバス検索のタグ表示

検索結果に付すタグは、以下4つを**フロントエンド側で突き合わせて生成**する。design.md §6.1.3 / §8.2。

**タグは3つの軸に分かれている。** 卒業要件の枠が (区分 × 履修区分) で決まるため、1軸に潰してはならない。

| 軸 | 値 |
|---|---|
| 状態 | `修得済み` |
| 区分 | `教養教育` / `専門基礎` / `専門応用` / `専門関連` |
| 履修区分 | `必修` / `選択必修` / `選択` / `随意` |

| 状況 | 出すタグ |
|---|---|
| 履修不可 | なし |
| 履修可 × 修得済み | `修得済み` + 区分 |
| 履修可 × 未修得 × 自課程の設置科目 | 区分 + 履修区分 |
| 履修可 × 未修得 × 他課程の設置科目 | `専門関連` のみ |

**バッジの配色と並びは `app/syllabus/_components/CourseTags.tsx` に1つだけ置く。** 以前は一覧PC・一覧モバイル・詳細の3か所に配色表が写されていた。**色は履修区分にだけ使う**(区分に色を割ると履修区分と競合する)。

**絞り込みの選択肢は `lib/syllabusUI.ts` の `TAG_CHIPS` / `CATEGORY_CHOICES`。** チップは履修区分と状態、セレクトは区分。**URL のクエリには持たない**(履修要項との突合から決まる値であり、api-clean に投げる検索条件ではない)。

**検索条件(キーワード・開講期など)は URL のクエリが正本。** ヘッダー・タブバーの「シラバス」は素の `/syllabus` ではなく `listHref(listQuery)` に向ける。`listQuery` は一覧を開いているあいだ `SyllabusQueryMemory` が URL から書き写す(design.md §8)。直書きの `/syllabus` に戻すと、時間割などを経由しただけで検索語が消える。

1. `GET /api/syllabi` の検索結果
2. `GET /api/curricula/{program}/{year}` の履修要項データ
3. Zustand `student.ts` の学生プロファイル
4. `GET /api/syllabi/{code}` の**対象課程**(`programs` / `faculties`)

**プロファイルが無いあいだは、チップもセレクトも押せるのに必ず0件になる。** タグが1つも付かないためで、その案内は `app/syllabus/_components/SyllabusProfileNotice.tsx` に1つだけ置き、PC・モバイルで共用する(チップの直下のバーと、絞り込みパネルの「区分」の注記)。**プロファイルがあるときは出さない** — 「取り込むと絞れます」は取り込んだ後には誤りになる。

タグは2段で決まる。**入口は `lib/useTagMap.ts` の `useTagMap()` だけで、これは `Map` ではなくタグを決める関数を返す。** 呼び出し側が2段目を掛け忘れられないようにするためで、`Map` に戻してはならない。

| 段 | 何をするか | どこ |
|---|---|---|
| 1 | 履修要項と突き合わせてタグの**候補**を作る | `lib/syllabusUI.ts` の `buildTagMap()` |
| 2 | **その学生がそのクラスを履修登録できるか**で候補を落とし、3軸のタグに決める | `lib/eligibility.ts` の `canRegister()` → `lib/syllabusUI.ts` の `resolveTags()` |

注意点が4つある。

- **`syllabusCodes` は配列である。** 1科目に複数のクラスが対応するため、すべてのコードに同じ候補を付ける
- **履修できないクラスにはタグを出さない。** 履修要項は科目の単位で書かれており履修可否を持たない。判定の正本はシラバスの対象課程で、規則は3分岐(学生の課程が `programs` に入る → 可 / `programs` が空で `faculties` に先端理工学部が入る → 課程指定なしで可 / それ以外 → 不可)。**修得済みだけはこの判定を掛けない**(成績の事実であり、これから履修できるかとは無関係)
- **対象課程が取れなかったコードにもタグを出さない。** 判定できないものについて何も主張しないという方針である。**空配列を渡して代用してはならない** — 空配列は「課程指定なし（＝履修可）」を意味するので、不明なものを全部履修可と扱ってしまう。`undefined` を渡して区別する
- **`own` が false の科目に履修区分を出さない。** その `type` は導出元の課程にとっての区分であり、閲覧している学生にとっての区分ではない。その学生にとっての区分は**専門関連科目**なので `専門関連` だけを出す。**`own` を履修可否の代理指標として使ってはならない**(履修できる他課程科目まで落ちる)

**絞り込みは検索結果の全件に効く。** タグは学生プロファイルとの突合で決まるため api-clean の検索条件にできず、**絞り込んだ結果をサーバへ送ることもできない**（「修得済みのコード一覧」はその学生の成績そのもの。要件§5）。したがって振り分けはクライアントで閉じる。

| 何を | どこから |
|---|---|
| 検索結果 | `searchCourses()` が**条件に当たる全件**を返す（500件ずつ辿る。30件ずつのページ送りはしない） |
| 対象課程（全件ぶん） | `fetchCourseTargets()` → `GET /api/course-targets`（gzip 約4KB。ETag が効く）。**引けなければ null にしてタグを出さずに続ける** — この口の失敗で一覧を落としてはならない |
| 担当教員名（表示中の行ぶん） | `fetchInstructorMap()` を**ブラウザから**呼ぶ（どの行が表示されるかを知っているのはブラウザだけ） |

**絞り込み・ページの切り出し・件数は `lib/useTaggedResults.ts` に集約し、PC とモバイルで共用する。** ページ送りは絞り込み後の並びに対して行い、`offset` は URL に残す（詳細画面から戻ったときに位置を保つため）。**絞り込みを変えたら `offset` を消す**（`lib/useFilterControls.ts`）。消さないと前の絞り込みでのページ位置が残る。

講義詳細ページはシラバス本体を持っているので追加の取得は要らない。

**課程名の比較は `lib/programs.ts` の `isSameProgram()` を通す。** 課程コード `06` は入学年度で改称され(環境生態工学課程 / 環境科学課程)、api-clean は両方を別々の課程として持つため、文字列の一致では取り違える。

**科目名の突合は `lib/courseTitle.ts` の `normalizeTitle()` を通す。** 大学のデータ自体が表記を混在させており、「仏教の思想A」は履修要項と api-clean が半角 `A`、Web シラバス検索ページが**全角 `Ａ`** である。成績表由来の科目名にも全角英数字や空白が混じるため、完全一致では外れる(修得しているのに `修得済み` タグが出ない不具合が実際に出ていた)。規則は **NFKC 正規化 + 空白除去**で、**backend の `requirements.py` の `normalize_title()` と同じに保つこと**。片方だけ直すと「残り単位では修得済みなのにタグが出ない」というねじれが起きる。

**教員名で引く語は `lib/instructorName.ts` の `instructorQueries()` で展開する。** api-clean の `instructor` は**登録された表記のままの部分一致**で、正規化を持たない(design.md §6.1 / §6.2)。教員名は全角スペース区切りで登録されているため、「山田 太郎」(半角)も「山田太郎」(区切りなし)も0件になっていた。**照合するのは api-clean であり一覧は教員名を返さない**ので、`normalizeTitle()` のように手元で正規化して突き合わせる手は使えない。入力の側を表記に寄せて引き直すこと。**引き直すのは入力どおりの語が空振りしたときだけ**にする(姓のみ・全角区切りのフルネームは1リクエストで当たる)。**backend の `app/agents/instructor_name.py` の `instructor_queries()` と同じ規則に保つこと**(検索画面はこちら、シラバスチャットは backend が引くため、食い違うと「検索では出るのにチャットでは見つからない」というねじれが起きる)。

## PDF解析

- `pdfjs-dist` でテキストレイヤーを抽出
- 龍谷大学成績表レイアウト前提のルールベースパーサーを実装
- 評価記号(`T`/`N`/`G`/`D`/`J`/`M`)と数値スコアを認識し合否を判定。100点満点の場合は60点以上を合格
- 解析失敗時は手入力へのフォールバックを促すメッセージを表示

**取り込むのは成績表に載っている全科目であり、履修状態(`status`)を付けて渡す**(要件§4.2)。不合格・履修辞退は【再履修の対象】として履修提案に渡すため、**パーサーで落としてはならない**(設計書 §6.1)。卒業要件の単位計算に数えるのは `passed` だけで、その絞り込みは単位を数える側(`CreditBar` / 取り込み確認 / マイデータ)と backend の `requirements.py` が行う。

読み取りで気をつける点が3つある。いずれも実データで踏んだもので、**評価列だけを見ると未修得・登録済みの科目が丸ごと落ちる。**

- **未修得の科目は評価列が空**である。成績は履修グリッドのセルにだけ入る(例: 心理学入門 58 / 環境としての情報技術 J)。評価列が空のときはグリッドの最新のセルに退避する。**グリッドにもセルが無ければ未履修**(科目名と単位だけが刷られている)なので除外する
- **再履修した科目はグリッドに成績セルが複数並ぶ。** 最初のセルは落とした回なので、修得学期として採ってはならない。評価列はその科目の最終結果なので、評価と同じ値のセルがその科目を修得した学期である
- **登録済みで成績が未確定の科目はグリッドに `***`(登録科目)/ `*`(継続履修中)が入る。** 成績ではないので `isScore()` を通らず、従来は科目ごと捨てていた。`status: "registered"` として取り込み、単位にも【再履修の対象】にも数えない(`isUnearned()` は不合格・履修辞退だけを指す)。履修提案では候補から外れる

**成績表からは学期の判断材料も読む**(design.md §5.2.1)。右上の**作成月日**(年はヘッダの年度から補う)と「**在籍年数 / 休学年数 / 在学年数**」で、次に登録する学期(`lib/targetTerm.ts`)の推定に使う。**成績の有無から学期を推定してはならない** — 成績が1件も付かなかった学期があると1年前の学期を指す。**基本情報欄は見出し「入学日」からの相対位置で読む**(帳票は作成年度によって全体が縦にずれる)。

**提案する学期は `lib/targetTerm.ts` の `useTargetTerm()` だけから引く。** 推定値と学生の選び直しをまとめ、`POST /api/proposal` の `targetTerm` と画面の選択欄(`app/proposal/_components/TargetTermSelect.tsx`)が同じ値を見るようにしている。ブラウザの今日の日付から学期を作って表示してはならない(提案の対象と食い違う)。

## 龍谷祭デモ向け機能

- `frontend/lib/dummy/` に複数パターンのダミー学生プロファイルを用意し、「デモモード」ボタンから読み込めるようにする
- 展示用端末では「PDF取り込み」を無効化する
