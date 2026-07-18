# フロントエンド タスクリスト

最終更新: 2026-07-18

---

## 凡例

- `[ ]` 未着手
- `[x]` 完了
- `[~]` 進行中 / 部分実装

---

## 完了済み

- [x] トップページ（PDF取り込みUI） — `app/page.tsx`, `app/_components/PcImportPage.tsx`, `MobileTimetablePage.tsx`
- [x] マイデータページ — `app/mydata/page.tsx`
- [x] シラバス検索ページ — `app/syllabus/page.tsx` + 各 `_components/`
- [x] シラバス詳細ページ — `app/syllabus/[code]/page.tsx`
- [x] 履修提案ページ（レイアウト） — `app/proposal/page.tsx` + 各 `_components/`
- [x] チャットページ（レイアウト） — `app/chat/page.tsx` + 各 `_components/`
- [x] Zustand student store (`lib/student.ts`)
- [x] ダミープロファイル (`lib/dummy/profiles.ts`) — 2パターン
- [x] ヘッダー・BottomTabBar
- [x] プライバシーポリシーページ

---

## 未着手 / 要対応

### 高優先度（デモ・機能の核心）

- [ ] **PDF解析実装** — `pdfjs-dist` でテキスト抽出 → 龍谷大学成績表パーサー → `StudentProfile` に変換
  - 評価記号 (`T`/`N`/`G`/`D`/`J`/`M`) と数値スコア(60点以上)の合否判定
  - 解析失敗時は手入力フォールバックを表示
  - `app/_components/PcImportPage.tsx` のアップロードゾーンにファイル選択を実装

- [ ] **履修提案API接続** (`POST /api/proposal` SSE)
  - `app/proposal/_components/ChatPanel.tsx` のプレースホルダー応答を実際のSSE受信に置換
  - `app/proposal/_components/TimetablePanel.tsx` の時間割をAPIレスポンスで動的描画
  - `app/proposal/_components/CreditBar.tsx` の単位数を `StudentProfile` から算出

- [ ] **チャットAPI接続** (`POST /api/chat/proposal` / `/api/chat/syllabus` SSE)
  - `app/chat/page.tsx` のプレースホルダー応答を実際のSSE受信に置換
  - `app/syllabus/_components/SyllabusChatBox.tsx` の送信処理を実装
  - リクエストに `StudentProfile` + 対話履歴を毎回含める

- [x] **Zustand chat store** (`lib/chat.ts`)
  - `Message[]` を管理。永続化オフ
  - 提案チャット / シラバスチャット / 講義単位チャットを分けて管理

### 中優先度（UX・正確性）

- [ ] **シラバスへの必修/選択タグ付け**
  - `GET /api/curricula/{program}/{year}` を呼び出して履修要項データ取得
  - 検索結果と `StudentProfile` を突き合わせて「必修」「選択」「既修得済み」タグを生成
  - `app/syllabus/_components/CourseCard.tsx` にタグ表示を追加

- [ ] **`syllabus-api.ts` のベースURLをバックエンドGWに変更**
  - 現在は `http://localhost:5050` 直打ち → `/api` プレフィックス経由に統一

- [ ] **シラバス単体チャット** (`POST /api/chat/syllabus/{code}` SSE)
  - `app/syllabus/[code]/page.tsx` にチャットボックスを追加

- [ ] **ダミープロファイルを増やす** — 龍谷祭デモ用に3パターン以上を `lib/dummy/profiles.ts` へ追加

- [ ] **モバイル版トップページ** — `MobileTimetablePage` は現在ハードコードの時間割を表示。PDF取り込みフローに変更

### 低優先度 / 将来対応

- [ ] **手入力フォールバックUI** — PDF解析失敗時に学年・課程・既修得科目を手動入力できるフォーム
- [ ] **エラー・ローディング状態** — シラバス検索・提案生成のローディングスピナーとエラーメッセージ
- [ ] **MobileProposalPage の完成** — `app/proposal/_components/MobileProposalPage.tsx` の中身を実装

---

## メモ

- バックエンドとの通信はすべて `/api/*` 経由（ゲートウェイが振り分け）
- `persist` ミドルウェア使用禁止（プライバシー要件）
- PDFファイル自体をサーバーへ送信しない
