<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

> **重要**: コードを書く前に必ず `docs/design.md` を参照し、その内容に準拠すること。

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
| TanStack Query | — | サーバーデータのキャッシュ管理 |
| pdfjs-dist | — | 成績表PDFのクライアント側解析 |
| shadcn/ui | — | UIコンポーネント |
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
│   ├── syllabus-api.ts             # バックエンドAPIクライアント
│   ├── syllabus.ts
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

サーバーから取得するデータ(シラバス検索結果など)は TanStack Query でキャッシュ管理する。

## バックエンドとの通信

フロントエンドはバックエンド(`/api/*`)のみと通信する。**既存シラバスバックエンド(`api-clean`)を直接呼ぶことはできない**(ゲートウェイが `/api/*` のみ backend へ振り分けるため)。

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

SSEは `fetch` + `ReadableStream` で受信し、受信したchunkを逐次 React state に反映する。

チャット系リクエストには**学生プロファイルと対話履歴を毎回含める**(サーバー側で永続化しないため)。

## プライバシー設計上の制約

以下はプライバシー要件から来る設計上の制約であり、変更してはならない。

- Zustand の `persist` ミドルウェアを使わない(localStorage・sessionStorage への書き込みを行わない)
- バックエンドに学生データを永続保存するAPIを追加しない
- 成績表PDFの解析はクライアント側(`pdfjs-dist`)で完結させ、PDFファイル自体をサーバーへ送信しない
- 学籍番号はPDFから意図的に抽出しない

## シラバス検索のタグ表示

検索結果に付す「必修」「選択」「既修得済み」タグは、以下3つを**フロントエンド側で突き合わせて生成**する。

1. `GET /api/syllabi` の検索結果
2. `GET /api/curricula/{program}/{year}` の履修要項データ
3. Zustand `student.ts` の学生プロファイル

## PDF解析

- `pdfjs-dist` でテキストレイヤーを抽出
- 龍谷大学成績表レイアウト前提のルールベースパーサーを実装
- 評価記号(`T`/`N`/`G`/`D`/`J`/`M`)と数値スコアを認識し合否を判定。100点満点の場合は60点以上を合格
- 解析失敗時は手入力へのフォールバックを促すメッセージを表示

## 龍谷祭デモ向け機能

- `frontend/lib/dummy/` に複数パターンのダミー学生プロファイルを用意し、「デモモード」ボタンから読み込めるようにする
- 展示用端末では「PDF取り込み」を無効化する
