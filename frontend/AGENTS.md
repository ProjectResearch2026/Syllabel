<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

> **重要**: コードを書く前に必ず設計書を参照し、その内容に準拠すること。設計書は `docs/design.md`(目次・改訂履歴)と `docs/design/01-07`(本文)に分かれており、§番号とファイルの対応は `docs/design.md` の「0.3 本書の構成」にある。

# フロントエンド開発ガイド

## プロジェクト概要

龍谷大学の学生向け「履修登録支援AIチャットボット」のフロントエンド。成績表PDFを取り込み、学生個人の状況(学年・課程・既修得科目)に応じた履修提案とシラバス検索を提供する。

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

## ディレクトリ構成

```
frontend/
├── app/                            # Next.js App Router
│   ├── page.tsx                    # / トップページ(学生情報入力)
│   ├── mydata/page.tsx             # /mydata 学生データ確認
│   ├── proposal/page.tsx           # /proposal 履修提案・チャット
│   ├── chat/page.tsx               # /chat チャット画面
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

**公開パスは `/pr-2026/api/*` であり `/api/*` ではない。** `next.config.ts` の `basePath` はページとアセットの生成先しか変えず `fetch()` のパスには前置されないため、呼び出し先に `/pr-2026` を自分で含める(design.md §3.5.2、§6.1)。

宛先の解決は `lib/api_base.ts` の `apiBase()` に集約する。**直接URLを書かない。**

| 呼び出し元 | 宛先 |
|---|---|
| ブラウザ(クライアントコンポーネント) | ゲートウェイと同一オリジンの `/pr-2026/api/...`(相対パス) |
| サーバ側描画(RSC / `page.tsx` の `async` 関数) | backend のオリジンを直に引く(`BACKEND_ORIGIN`)。ゲートウェイを経由しないため `/pr-2026` は付かない |

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

SSEは `fetch` + `ReadableStream` で受信し、受信したchunkを逐次 React state に反映する。書式は `data: <JSON>` の1行1イベントで、イベント名は design.md §6.1.1 に従う(`lib/chatApi.ts`)。

| 用途 | イベント |
|---|---|
| チャット系(`/api/chat/*`) | `{"delta": "..."}` / `{"error": "..."}` / `{"done": true}` |
| 履修提案(`/api/proposal`) | `{"snapshot": {...}}` / `{"result": {...}}` に加えて `error` / `done` |

チャット系リクエストには**学生プロファイルと対話履歴を毎回含める**(サーバー側で永続化しないため)。

履修提案の科目スキーマは design.md §5.3 に従う(`syllabusCode` / `title` / `day` / `period` / `term` / `credits` / `category` / `reason`)。必須は `title` と `reason` だけで、**集中講義の曜日・時限や特定できないシラバスコードは null** で来る。

## 課程コードの解決

履修要項を引くキーは **(課程コード, 入学年度)** である(design.md §4.4.2)。`StudentProfile.program` に入るのは**課程名**なので、`GET /api/curricula` と `POST /api/proposal` を呼ぶ前に `lib/programs.ts` の `programCodeOf()` でコードに直す。入学年度も同モジュールの `getAdmissionYear()` で学年から算出する。課程一覧の正本は `curricula/admission-<年度>/` の課程ファイルである。

## プライバシー設計上の制約

以下はプライバシー要件から来る設計上の制約であり、変更してはならない。

- Zustand の `persist` ミドルウェアを使わない(localStorage・sessionStorage への書き込みを行わない)
- バックエンドに学生データを永続保存するAPIを追加しない
- 成績表PDFの解析はクライアント側(`pdfjs-dist`)で完結させ、PDFファイル自体をサーバーへ送信しない
- 学籍番号はPDFから意図的に抽出しない

## シラバス検索のタグ表示

検索結果に付す「必修」「選択」「既修得済み」タグは、以下4つを**フロントエンド側で突き合わせて生成**する。design.md §6.1.3。

1. `GET /api/syllabi` の検索結果
2. `GET /api/curricula/{program}/{year}` の履修要項データ
3. Zustand `student.ts` の学生プロファイル
4. `GET /api/syllabi/{code}` の**対象課程**(`programs` / `faculties`)

タグは2段で決まる。**入口は `lib/useTagMap.ts` の `useTagMap()` だけで、これは `Map` ではなくタグを決める関数を返す。** 呼び出し側が2段目を掛け忘れられないようにするためで、`Map` に戻してはならない。

| 段 | 何をするか | どこ |
|---|---|---|
| 1 | 履修要項と突き合わせてタグの**候補**を作る | `lib/syllabusUI.ts` の `buildTagMap()` |
| 2 | **その学生がそのクラスを履修登録できるか**で候補を落とす | `lib/eligibility.ts` の `canRegister()` → `lib/syllabusUI.ts` の `resolveTag()` |

注意点が4つある。

- **`syllabusCodes` は配列である。** 1科目に複数のクラスが対応するため、すべてのコードに同じ候補を付ける
- **履修できないクラスにはタグを出さない。** 履修要項は科目の単位で書かれており履修可否を持たない。判定の正本はシラバスの対象課程で、規則は3分岐(学生の課程が `programs` に入る → 可 / `programs` が空で `faculties` に先端理工学部が入る → 課程指定なしで可 / それ以外 → 不可)。**既修得済みだけはこの判定を掛けない**(成績の事実であり、これから履修できるかとは無関係)
- **対象課程が取れなかったコードにもタグを出さない。** 判定できないものについて何も主張しないという方針である
- **`own` が false の科目には候補を出さない。** その `type` は導出元の課程にとっての区分であり、閲覧している学生にとっての区分ではない。**`own` を履修可否の代理指標として使ってはならない**(履修できる他課程科目まで落ちる)

**対象課程の取得に追加のリクエストは要らない。** 一覧ページは担当教員名のために表示中30件ぶんの詳細をすでに引いており(`lib/syllabus-api.ts` の `fetchCardMetaMap()`)、対象課程は同じレスポンスに入っている。講義詳細ページはシラバス本体を持っている。

**課程名の比較は `lib/programs.ts` の `isSameProgram()` を通す。** 課程コード `06` は入学年度で改称され(環境生態工学課程 / 環境科学課程)、api-clean は両方を別々の課程として持つため、文字列の一致では取り違える。

## PDF解析

- `pdfjs-dist` でテキストレイヤーを抽出
- 龍谷大学成績表レイアウト前提のルールベースパーサーを実装
- 評価記号(`T`/`N`/`G`/`D`/`J`/`M`)と数値スコアを認識し合否を判定。100点満点の場合は60点以上を合格
- 解析失敗時は手入力へのフォールバックを促すメッセージを表示

## 龍谷祭デモ向け機能

- `frontend/lib/dummy/` に複数パターンのダミー学生プロファイルを用意し、「デモモード」ボタンから読み込めるようにする
- 展示用端末では「PDF取り込み」を無効化する
