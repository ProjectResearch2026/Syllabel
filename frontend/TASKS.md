# フロントエンド タスクリスト

最終更新: 2026-08-27

---

## 凡例

- `[ ]` 未着手
- `[x]` 完了
- `[~]` 進行中 / 部分実装

---

## 完了済み

- [x] トップページ（PDF取り込みUI・PCデスクトップ） — `app/page.tsx`, `app/_components/PcImportPage.tsx`
- [x] **PDF解析実装（PCデスクトップ）** — `lib/pdf/parseGradeReport.ts`
  - ファイル選択・ドラッグ＆ドロップ、プライバシー同意モーダル、`pdfjs-dist` テキスト抽出、ルールベースパーサー、合否判定、ローディング/エラー状態すべて実装済み
  - 評価記号 (`T`/`N`/`G`/`D`/`J`/`M`) と数値スコア(60点以上合格)の判定あり
- [x] マイデータページ — `app/mydata/page.tsx`
- [x] シラバス検索ページ — `app/syllabus/page.tsx` + 各 `_components/`
- [x] シラバス詳細ページ — `app/syllabus/[code]/page.tsx`
- [x] シラバス単体チャット UI・API接続 — `_components/CourseChatPanel.tsx`（PCデスクトップ）、`_components/SyllabusChatBox.tsx`（モバイル）。詳細ページに統合済み。`POST /api/chat/syllabus/{code}` SSE接続済み（`feature/syllabus-course-chat-sse` ブランチ）
- [x] 履修提案ページ（レイアウト・API接続） — `app/proposal/page.tsx` + 各 `_components/`。`POST /api/proposal` SSE + `POST /api/chat/proposal` SSE 接続済み。`lib/proposal.ts` で提案状態管理
- [x] **エラー・ローディング状態（提案ページ）** — `app/proposal/error.tsx` / `loading.tsx` 追加済み
- [x] **シラバスへの必修/選択タグ付け** — `SyllabusTagList.tsx` + curricula API 突合。`CourseCard.tsx` バッジ表示、`SyllabusTopBar.tsx` / `MobileSyllabusPage.tsx` 絞り込みロジック実装済み。`lib/syllabusUI.ts` でタグ状態管理
- [x] チャットページ（レイアウト・API接続） — `app/chat/page.tsx` + 各 `_components/`。`POST /api/chat/syllabus` SSE接続済み
- [x] Zustand student store — `lib/student.ts`
- [x] Zustand chat store — `lib/chat.ts`（提案チャット / シラバスチャット / 講義単位チャットを分離管理、永続化オフ）
- [x] ダミープロファイル — `lib/dummy/profiles.ts`（3パターン: 3回生・知能情報メディア / 2回生・再履修あり / 1回生・電子情報通信）
- [x] ヘッダー・BottomTabBar
- [x] プライバシーポリシーページ
- [x] **PDF解析実装（モバイル）** — `app/import/_components/MobileImportFlow.tsx`
  - `parseGradeReport` 呼び出し・ローディング/エラー状態・確認画面・デモモードドロップダウンすべて実装済み
- [x] **手入力フォールバックUI** — `app/import/_components/ManualInputForm.tsx`
  - PDF解析失敗時の「手入力で続ける」導線、学年・課程・既修得科目の入力フォーム、`MobileSettingsPage` 編集機能
- [x] **デモモードスイッチャー（PC・モバイル取り込みフロー）**
  - `PcImportPage.tsx` / `MobileImportFlow.tsx` でプロファイル選択UIを実装済み。store への反映も完了
- [x] **エラー・ローディング状態（シラバス検索・詳細）**
  - `app/syllabus/error.tsx` / `loading.tsx` — 検索一覧のエラーUI・スケルトン実装済み
  - `app/syllabus/[code]/error.tsx` / `loading.tsx` — 詳細ページのエラーUI・スケルトン実装済み
---

## 未着手 / 要対応

### すぐ着手できる（実装コスト小）

- [x] **モバイル版時間割グリッドへの提案結果反映** — `app/_components/MobileTimetablePage.tsx`
  - `useProposalStore` 接続済み。提案結果を `coursesToTimetable` で変換してセルに描画。ロード中は `animate-pulse`

- [x] **`/chat` ContextBanner のストア接続** — `app/chat/_components/ContextBanner.tsx`
  - `useStudentStore` / `useProposalStore` から実値を取得して表示。プロファイル未取得時は案内文言に切り替え済み

### 低優先度 / 将来対応

- [x] **履修提案API接続の完全化（卒業単位算出）**
  - `GET /api/curricula` を用いた「卒業残り単位」の正確な算出を実装済み — `lib/curricula.ts` の `useGraduationCredits` フック。curricula API が返すコース単位数の合計を卒業必要単位数として使用し、失敗時は 124 にフォールバック。`CreditBar.tsx` / `MobileProposalPage.tsx` で利用
  - バックエンドの `/api/proposal` レスポンス形式が確定したら `streamProposal` の `courses` / `total_credits` パース処理を調整

---

## メモ

- バックエンドとの通信はすべて `/api/*` 経由（ゲートウェイが振り分け）— design.md §1.2
- `persist` ミドルウェア使用禁止（プライバシー要件）— design.md §9
- PDFファイル自体をサーバーへ送信しない — 解析はクライアント完結
- design.md §8 の正規ルート: `/`・`/proposal`・`/syllabus`・`/syllabus/[code]`・`/privacy`
- `lib/chat.ts` の `courseMessages` フィールドは design.md §5.2.2 では `syllabusPerCourse` として定義されているが、実装名が異なる（機能は同等）
- SSE は `fetch` + `ReadableStream` 方式で実装済み。`lib/chatApi.ts` の `readSSE` 共通ヘルパー経由で全チャット系エンドポイントに対応
- `coursesToTimetable` ヘルパーが `MobileProposalPage.tsx` / `TimetablePanel.tsx` に重複定義。共通化の余地あり（低優先）
