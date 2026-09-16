# フロントエンド タスクリスト

最終更新: 2026-09-16

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
- [x] **履修可否によるタグ・提案候補の絞り込み（設計書 v0.9.25 / §6.1.3）** — `lib/eligibility.ts` 新設。シラバスの対象課程で「その学生がそのクラスを履修登録できるか」を判定し、できないものはタグを出さず提案の候補にも載せない。検索は誤タグ126件が消え(430→304)、履修提案はプロンプトの履修不可クラス189行が0になった(673→508)。backend 側は `proposal_agent.py` の `fetch_eligibility()`
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
  - `GET /api/curricula` を用いた「卒業残り単位」の算出を実装済み — `lib/curricula.ts` の `useGraduationCredits` フック。backend が返す `graduation.totalCredits` を使い、失敗時は 124 にフォールバック。`CreditBar.tsx` / `MobileProposalPage.tsx` で利用
  - **設置科目の単位数の総和は卒業必要単位数ではない**（design.md §6.1）。`courses` から合計してはならない

---

## 完了（続き）

- [x] **タグを3軸に拡張（設計書 v0.9.26 / §8.2、要件定義書 §4.5）** — 状態（`修得済み`）／区分（`教養教育`・`専門基礎`・`専門応用`・`専門関連`）／履修区分（`必修`・`選択必修`・`選択`・`随意`）。卒業要件の枠が (区分 × 履修区分) で決まるため1軸に潰さない
  - **`選択必修` の欠落を直した** — `buildTagMap()` が `選択` に丸めていた。2024・2025年度入学コホートで142科目（専門基礎24・専門応用52・教養66）。知能情報メディア課程の専攻科目には0件なので第1フェーズで露見していなかった
  - **`随意` の欠落を直した** — 20科目。卒業要件単位に算入されず履修提案の候補からも外れる科目なのにタグなしだった
  - **`専門関連` を新設** — v0.9.25 の履修可否判定が入ったことで出せるようになった（224コード）
  - 履修区分を出さないのは2つ。修得済みのとき、他課程の設置科目のとき
  - バッジの実装を `app/syllabus/_components/CourseTags.tsx` に集約（一覧PC・一覧モバイル・詳細の3か所に配色表が写されていた）。**色は履修区分にだけ使う**
  - 絞り込みはチップ＝履修区分と状態、セレクト＝区分。選択肢は `lib/syllabusUI.ts` の `TAG_CHIPS` / `CATEGORY_CHOICES` に一本化
  - タグ付きコードは 304 → 528（2026年度開講・2024年度入学・知能情報メディア課程）

---

## 未対応（backend 側）

- [ ] **`POST /api/chat/proposal` が backend に未実装** — design.md §6.1 の表にはあるが、ルートが入るまで 404 を返す。frontend 側（`lib/chatApi.ts` の `streamProposalChat`、`ChatPanel.tsx` / `MobileProposalPage.tsx`）は接続済み
- [ ] **`GET /api/syllabi` 系の上流障害が 500 になる** — `backend/app/api/syllabus.py` は `httpx.HTTPStatusError` だけを捕捉しており、接続失敗（`httpx.RequestError`）が素通りする。design.md §6.1 / §3.4.4 の規定は 502

---

## 既知の問題（未着手。PR1 のスコープ外）

- [ ] **1回生・4回生はタグが1つも出ない** — `getAdmissionYear()` は 1回生→2026年度入学 / 4回生→2023年度入学 を返すが、`curricula/` にあるのは 2024・2025 の2コホートだけ。`GET /api/curricula` が404になり、`useTagMap()` の `catch` が握りつぶすため**画面には何も出ない**。2026年度の履修要項は作成中で正式公開前、4回生は履修提案の対象外という判断のため保留。ただし**デモ用プロファイルの「1回生・電子情報通信課程」がこの状態**（`lib/dummy/profiles.ts`）。少なくとも理由を画面に出す応急処置は要る
- [x] **修得済みの突合が科目名の完全一致で落ちていた（設計書 v0.9.27 / §6.1.3）** — `lib/courseTitle.ts` の `normalizeTitle()`（NFKC + 空白除去）を新設し、backend の `requirements.py` の `normalize_title()` と同じ規則に揃えた。**大学のデータ自体が混在**しており「仏教の思想A」は履修要項と api-clean が半角 `A`(U+0041)、Web シラバス検索ページが全角 `Ａ`(U+FF21)。成績表PDFも全角側に当たると修得済みタグが出なかった。**backend には正規化があり frontend には無かった**ため、「残り単位では修得済みなのにタグが出ない」というねじれになっていた。**両者は同じ規則に保つこと**
- [x] **タグの絞り込みが取得済みの30件の中だけで効いていた（設計書 v0.9.28 / §6.1・§6.1.3・§8）** — 検索を**全件取得**に変え、履修可否の判定に要る対象課程は `GET /api/course-targets` を新設してまとめて返すようにした。修得済み 184 コードが 41 ページに散り 35 ページが「該当なし」だった状態が解消し、絞り込み後の件数とページ送りが一致する。**`countCourses()` の500件ブロック探索も不要になった**（`results.length` が総件数）。件数・ページ送り・担当教員名の取得をクライアントへ移し、`lib/useTaggedResults.ts` に集約して PC・モバイルで共用

---

## メモ

- バックエンドとの通信は **`/pr-2026/api/*`** 経由（ゲートウェイが `/pr-2026` を剥がして backend へ振り分け）— design.md §3.5.2、§6.1。`basePath` は `fetch()` のパスに前置されないため、宛先は `lib/api_base.ts` の `apiBase()` で解決する
- `persist` ミドルウェア使用禁止（プライバシー要件）— design.md §9
- PDFファイル自体をサーバーへ送信しない — 解析はクライアント完結
- design.md §8 の正規ルート: `/`・`/proposal`・`/syllabus`・`/syllabus/[code]`・`/privacy`
- `lib/chat.ts` の `courseMessages` フィールドは design.md §5.2.2 では `syllabusPerCourse` として定義されているが、実装名が異なる（機能は同等）
- SSE は `fetch` + `ReadableStream` 方式で実装済み。`lib/chatApi.ts` の `readSSE` 共通ヘルパー経由で全チャット系エンドポイントに対応
- `coursesToTimetable` は `lib/timetable.ts` に一本化済み（`MobileProposalPage.tsx` / `TimetablePanel.tsx` / `MobileTimetablePage.tsx` から共用）
- 検索結果のタグは2段（`buildTagMap()` で候補 → `resolveTags()` で履修可否を掛けて3軸に決める）。入口は `lib/useTagMap.ts` の `useTagMap()` だけで、**`Map` ではなく関数を返す**（呼び出し側が2段目を掛け忘れないため。`Map` に戻さない）— 設計書 §6.1.3
- 履修可否の判定規則は設計書 §6.1.3 に1か所で書き、実装は frontend（`lib/eligibility.ts`）と backend（`proposal_agent.py` の `fetch_eligibility()`）の2か所にある。取得経路が違うため実装は分かれる。**片方だけ直さないこと**
- 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は課程名なので `lib/programs.ts` でコードに解決する — design.md §4.4.2
