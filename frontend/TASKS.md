# フロントエンド タスクリスト

最終更新: 2026-07-23

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
- [x] シラバス単体チャット UI — `_components/CourseChatPanel.tsx`（PCデスクトップ）、`_components/SyllabusChatBox.tsx`（モバイル）。詳細ページに統合済み。API未接続
- [x] 履修提案ページ（レイアウト） — `app/proposal/page.tsx` + 各 `_components/`
- [x] チャットページ（レイアウト） — `app/chat/page.tsx` + 各 `_components/`（シラバス全体チャット用）
- [x] Zustand student store — `lib/student.ts`
- [x] Zustand chat store — `lib/chat.ts`（提案チャット / シラバスチャット / 講義単位チャットを分離管理、永続化オフ）
- [x] ダミープロファイル — `lib/dummy/profiles.ts`（3パターン: 3回生・知能情報メディア / 2回生・再履修あり / 1回生・電子情報通信）
- [x] ヘッダー・BottomTabBar
- [x] プライバシーポリシーページ
- [x] **PDF解析実装（モバイル）** — `app/import/_components/MobileImportFlow.tsx`
  - `parseGradeReport` 呼び出し・ローディング/エラー状態・確認画面・デモモードドロップダウンすべて実装済み
- [x] **手入力フォールバックUI** — `app/import/_components/ManualInputForm.tsx`
  - PDF解析失敗時の「手入力で続ける」導線、学年・課程・既修得科目の入力フォーム、`MobileSettingsPage` 編集機能

---

## 未着手 / 要対応

### 高優先度（デモ・機能の核心）

- [x] **PDF解析（モバイル）** — `app/import/_components/MobileImportFlow.tsx`
  - `parseGradeReport` 呼び出し・ローディング/エラー状態・確認画面すべて実装済み（コミット c9805fc）

- [ ] **履修提案API接続** (`POST /api/proposal` SSE)
  - `app/proposal/_components/ChatPanel.tsx` — プレースホルダー文字列をSSE受信に置換
  - `app/proposal/_components/TimetablePanel.tsx` — `lib/timetable.ts` のハードコード時間割をAPIレスポンスで動的描画
  - `app/proposal/_components/CreditBar.tsx` — ハードコード値(`"62"`/`"18"`/`"46"`)を `StudentProfile` から算出
  - リクエストにプロファイル + 希望条件を含める（design.md §7.2）

- [ ] **チャットAPI接続** (`POST /api/chat/proposal` / `POST /api/chat/syllabus` SSE)
  - `app/chat/page.tsx` — プレースホルダー応答を実際のSSE受信に置換
  - `app/syllabus/_components/SyllabusChatBox.tsx` / `CourseChatPanel.tsx` — 同上
  - リクエストに `StudentProfile` + 対話履歴を毎回含める（サーバー側永続化なし、design.md §6.1）

- [ ] **シラバス単体チャットAPI接続** (`POST /api/chat/syllabus/{code}` SSE)
  - `CourseChatPanel.tsx` / `SyllabusChatBox.tsx` のプレースホルダーをSSE接続に置換
  - 現在表示中の `syllabus_code` をリクエストに含める（design.md §7.5）

### 中優先度（UX・正確性）

- [ ] **シラバスへの必修/選択タグ付け**（design.md §6.1, §8）
  - `GET /api/curricula/{program}/{year}` を呼び出して履修要項データ取得
  - 検索結果 × `GET /api/curricula` × `StudentProfile` を突き合わせて「必修」「選択」「既修得済み」タグ生成
  - 突合はシラバスコード（`syllabus_codes` ↔ `syllabus_code`）による結合を第一とする
  - `app/syllabus/_components/CourseCard.tsx` にタグ表示を追加

- [ ] **`lib/syllabus-api.ts` のベースURLを相対パスに変更**
  - 現在: `http://localhost:8000/api`（絶対URL直打ち）→ `/api` プレフィックス経由に統一（design.md §1.2）

- [ ] **デモモードボタン**（龍谷祭展示用、design.md §11）
  - 3パターンのダミープロファイルをボタン操作で切り替えられるUIを実装
  - 現状: 3パターン定義済みだが `DUMMY_PROFILES[0]` のみ参照。スイッチャーなし
  - 展示用端末ではPDF取り込みを無効化し、ダミーデータ専用とする

- [ ] **モバイル版トップページ** — `app/_components/MobileTimetablePage.tsx`
  - 現状: ハードコードの静的時間割とクレジット表示のみ
  - 対応: PDF取り込みフロー(`MobileImportFlow`)へ切り替え、`StudentProfile` に連動した表示に変更

- [x] **手入力フォールバックUI** — `app/import/_components/ManualInputForm.tsx`
  - エラー画面に「手入力で続ける」ボタン追加（`MobileImportFlow.tsx`）
  - 学年・課程・既修得科目の手動入力フォーム実装
  - `MobileSettingsPage.tsx` の「学年・課程」「修得科目を編集」「編集ボタン」をフォームに接続済み

### 低優先度 / 将来対応

- [ ] **エラー・ローディング状態** — シラバス検索・提案生成
  - シラバス検索: `<Suspense fallback=...>` にスケルトンUI追加、エラー境界(`error.tsx`)を設置
  - 提案ページ: 提案生成中のスピナー、失敗時のエラーメッセージ
- [ ] **MobileProposalPage の完成** — `app/proposal/_components/MobileProposalPage.tsx` の中身を実装

---

## メモ

- バックエンドとの通信はすべて `/api/*` 経由（ゲートウェイが振り分け）— design.md §1.2
- `persist` ミドルウェア使用禁止（プライバシー要件）— design.md §9
- PDFファイル自体をサーバーへ送信しない — 解析はクライアント完結
- design.md §8 の正規ルート: `/`・`/proposal`・`/syllabus`・`/syllabus/[code]`・`/privacy`
- `lib/chat.ts` の `courseMessages` フィールドは design.md §5.2.2 では `syllabusPerCourse` として定義されているが、実装名が異なる（機能は同等）
