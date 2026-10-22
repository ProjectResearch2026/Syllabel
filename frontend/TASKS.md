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
- [x] シラバス単体チャット UI・API接続 — `_components/CourseChatPanel.tsx`（PCデスクトップ）、`_components/CourseMobileAssistant.tsx`（モバイル。会話は `lib/useCourseConversation.ts` を PC と共有。旧 `SyllabusChatBox.tsx` は削除）。詳細ページに統合済み。`POST /api/chat/syllabus/{code}` SSE接続済み（`feature/syllabus-course-chat-sse` ブランチ）
- [x] 履修提案ページ（レイアウト・API接続） — `app/proposal/page.tsx` + 各 `_components/`。`POST /api/proposal` SSE + `POST /api/chat/proposal` SSE 接続済み。`lib/proposal.ts` で提案状態管理
- [x] **履修提案は学生の指示で始める（設計書 v0.9.44 / §8.3）** — `/proposal` に到達した時点で `POST /api/proposal` を撃っていた（`ProposalLoader`）ため、学生が希望条件を書く前に4〜5分かかる提案が始まっていた。ローダーを廃し、対話を `lib/useProposalConversation.ts` に集約。**1つの入力欄が提案の有無で `/api/proposal` と `/api/chat/proposal` に向かう**（§8.3.1）。希望条件なしで始める導線、再提案（§8.3.3）、前提が揃わないときの理由表示（§8.3.2）、入力欄の断り書き（§9.1）を実装
- [x] **提案チャットのリクエストが backend のスキーマと違っていた** — `streamProposalChat()` が `{profile, history, message}`（シラバスチャットの形）を送っていたが、`POST /api/chat/proposal` は `{studentProfile, proposal, messages}` を受ける（§6.1、`backend/app/schemas/chat.py`）。**`proposal` が無いため常に 422** で、提案画面のチャットもAIシートの時間割文脈も応答を得られていなかった
- [x] **リセット（要件§4.8）が提案を消していなかった** — `clearProfile()` / 対話履歴の `clearAll()` は呼ぶが `lib/proposal.ts` はそのままで、生成済みの時間割が残っていた。ヘッダー・PCマイデータ・モバイル設定の3か所に `clear()` を追加
- [x] **エラー・ローディング状態（提案ページ）** — `app/proposal/error.tsx` / `loading.tsx` 追加済み
- [x] **シラバスへの必修/選択タグ付け** — `SyllabusTagList.tsx` + curricula API 突合。`CourseCard.tsx` バッジ表示、`SyllabusTopBar.tsx` / `MobileSyllabusPage.tsx` 絞り込みロジック実装済み。`lib/syllabusUI.ts` でタグ状態管理
- [x] **履修可否によるタグ・提案候補の絞り込み（設計書 v0.9.25 / §6.1.3）** — `lib/eligibility.ts` 新設。シラバスの対象課程で「その学生がそのクラスを履修登録できるか」を判定し、できないものはタグを出さず提案の候補にも載せない。検索は誤タグ126件が消え(430→304)、履修提案はプロンプトの履修不可クラス189行が0になった(673→508)。backend 側は `proposal_agent.py` の `fetch_eligibility()`
- [x] チャットページ（レイアウト・API接続） — `app/chat/page.tsx` + 各 `_components/`。`POST /api/chat/syllabus` SSE接続済み
- [x] Zustand student store — `lib/student.ts`
- [x] Zustand chat store — `lib/chat.ts`（提案チャット / シラバスチャット / 講義単位チャットを分離管理、永続化オフ）
- [x] ダミープロファイル — `lib/dummy/profiles.ts`（6課程×1件: 3回生・知能情報メディア / 3回生・環境生態工学 / 2回生・数理・情報科学 / 2回生・応用化学 / 1回生・電子情報通信 / 1回生・機械工学・ロボティクス）
- [x] ヘッダー・ボトムドック（`components/BottomDock.tsx`。旧 BottomTabBar を Ask Bar と一体にした）
- [x] プライバシーポリシーページ
- [x] **PDF解析実装（モバイル）** — `app/_components/MobileImportFlow.tsx`（`/`。旧 `app/import/_components/` から移動）
  - `parseGradeReport` 呼び出し・ローディング/エラー状態・確認画面・デモモードドロップダウンすべて実装済み
- [x] **マイデータの訂正（設計書 v0.9.86 / §8.4）** — `app/_components/ProfileEditForm.tsx`（旧 `ManualInputForm.tsx`。手入力は廃止）
  - 学年・課程の訂正、科目の履修状態の変更・削除、履修要項の科目からの追加。PC(`PcMyDataPage`)・モバイル(`MobileSettingsPage`)で共用
  - PDF解析失敗時は「もう一度選ぶ」か「デモの学生で試す」へ案内する
- [x] **PC の卒業要件の帯で取得済みの枠を全部見られるようにする（設計書 v0.9.87 / §8.3.5）** — `RequirementsPanel.tsx` の `DoneSummary`。2行で切れる名前の右上に「○枠 ▾」のボタンを置き、押すと公式の区分名と単位数の一覧を開く（ツールチップは指で開けなかった）
- [x] **修得済みの科目にも履修区分のタグを出す（設計書 v0.9.88 / §8.2.1・§8.2.2）** — `resolveTags()`。「修得済みを除く」を OFF にしても履修区分のチップの件数が変わらなかった。他課程の設置科目には修得済みでも出さない
- [x] **デモモードスイッチャー（PC・モバイル取り込みフロー）**
  - `PcImportPage.tsx` / `MobileImportFlow.tsx` でプロファイル選択UIを実装済み。store への反映も完了
- [x] **エラー・ローディング状態（シラバス検索・詳細）**
  - `app/syllabus/error.tsx` / `loading.tsx` — 検索一覧のエラーUI・スケルトン実装済み
  - `app/syllabus/[code]/error.tsx` / `loading.tsx` — 詳細ページのエラーUI・スケルトン実装済み
---

## 未着手 / 要対応

### すぐ着手できる（実装コスト小）

- [x] **モバイル版時間割グリッドへの提案結果反映** — `app/proposal/_components/MobileProposalPage.tsx`（旧 `MobileTimetablePage.tsx` は統合して削除）
  - `useProposalStore` 接続済み。提案結果を PC と同じ `coursesToSlotTable` で変換してセルに描画（1マス複数科目・クォーター印・曜日時限未定）。ロード中は `animate-pulse`

- [x] **PC とモバイルのルート統一と ui-design_phone.pen 改訂の反映（設計書 v0.9.63 / §8）** — モバイルも `/` を取り込み、`/proposal` を時間割にした（`/import` は `/` へ転送）。AI の会話を `AiConversation` で PC のパネルとモバイルのシートに共有。モバイルの時間割に卒業要件の帯（`MobileRequirementsStrip`）と PC と同じ単位集計を出した

- [x] **`/chat` ContextBanner のストア接続** — `app/chat/_components/ContextBanner.tsx`
  - `useStudentStore` / `useProposalStore` から実値を取得して表示。プロファイル未取得時は案内文言に切り替え済み

### 低優先度 / 将来対応

- [x] **履修提案API接続の完全化（卒業単位算出）**
  - `GET /api/curricula` を用いた「卒業残り単位」の算出を実装済み — `lib/curricula.ts` の `useGraduationCredits` フック。backend が返す `graduation.totalCredits` を使い、失敗時は 124 にフォールバック。単位の集計は `lib/creditSummary.tsx` の `useCreditSummary()` に集約（PC のヘッダー・`CreditBar.tsx`・モバイルの時間割が共有）
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
- [x] **教養教育科目の分野をタグと絞り込みに加えた(設計書 v0.9.80 / §8.2、要件定義書 §4.5)** — 履修要項の `subcategory`(人文科学系科目など)を、区分の直後のバッジ(表示名は括弧と末尾の「科目」を除いた形)と、区分が `教養教育` のときだけ出る「分野」のセレクトに出す。基幹は `選択必修` と一致するため別のタグにしない

---

## 未対応（backend 側）

- [ ] **`POST /api/chat/proposal` が backend に未実装** — design.md §6.1 の表にはあるが、ルートが入るまで 404 を返す。frontend 側（`lib/chatApi.ts` の `streamProposalChat`、`lib/useProposalConversation.ts`。PC の `ChatPanel.tsx` とモバイルの AI シートが共有）は接続済み
- [x] **`GET /api/syllabi` 系の上流障害が 500 になる** — 対応済み(接続失敗・タイムアウトも 502。design.md §6.1)。当時の状況: `backend/app/api/syllabus.py` は `httpx.HTTPStatusError` だけを捕捉しており、接続失敗（`httpx.RequestError`）が素通りする。design.md §6.1 / §3.4.4 の規定は 502

---

## 既知の問題（未着手。PR1 のスコープ外）

- [ ] **履修要項が引けないとタグが黙って消える** — `curricula/` は 2023〜2026年度入学の全課程が揃ったため、1回生・4回生(2026・2023年度入学)でもタグは出る。ただし対応する履修要項が無い入学年度(例: 2022年度以前の入学で在学中の学生)では `GET /api/curricula` が404になり、`useTagMap()` の `catch` が握りつぶすため**画面には理由が何も出ない**(`SyllabusProfileNotice` はプロファイルが無いときしか出ない)。理由を画面に出す応急処置は要る
- [x] **修得済みの突合が科目名の完全一致で落ちていた（設計書 v0.9.27 / §6.1.3）** — `lib/courseTitle.ts` の `normalizeTitle()`（NFKC + 空白除去）を新設し、backend の `requirements.py` の `normalize_title()` と同じ規則に揃えた。**大学のデータ自体が混在**しており「仏教の思想A」は履修要項と api-clean が半角 `A`(U+0041)、Web シラバス検索ページが全角 `Ａ`(U+FF21)。成績表PDFも全角側に当たると修得済みタグが出なかった。**backend には正規化があり frontend には無かった**ため、「残り単位では修得済みなのにタグが出ない」というねじれになっていた。**両者は同じ規則に保つこと**
- [x] **タグの絞り込みが取得済みの30件の中だけで効いていた（設計書 v0.9.28 / §6.1・§6.1.3・§8）** — 検索を**全件取得**に変え、履修可否の判定に要る対象課程は `GET /api/course-targets` を新設してまとめて返すようにした。修得済み 184 コードが 41 ページに散り 35 ページが「該当なし」だった状態が解消し、絞り込み後の件数とページ送りが一致する。**`countCourses()` の500件ブロック探索も不要になった**（`results.length` が総件数）。件数・ページ送り・担当教員名の取得をクライアントへ移し、`lib/useTaggedResults.ts` に集約して PC・モバイルで共用

---

## デプロイ時の注意

- **frontend と backend は揃えて入れ替える**（設計書 §3.3）。frontend だけを入れ替えて `GET /api/course-targets` を持たない古い backend に当たり、検索画面が「シラバスの読み込みに失敗しました」になる事故が実際に起きた

```bash
podman build -t localhost/syllabel-backend:latest ./backend
podman build -t localhost/syllabel-frontend:latest ./frontend
systemctl --user restart syllabel-backend.service syllabel-frontend.service
```

- `podman build` が全ステップ `Using cache` になるときは、**そのソースで既にビルド済み**ということ。`git pull` を忘れていないか確認する

## メモ

- バックエンドとの通信は **`/syllabel/api/*`** 経由（ゲートウェイが `/syllabel` を剥がして backend へ振り分け）— design.md §3.5.2、§6.1。`basePath` は `fetch()` のパスに前置されないため、宛先は `lib/api_base.ts` の `apiBase()` で解決する
- `persist` ミドルウェア使用禁止（プライバシー要件）— design.md §9
- PDFファイル自体をサーバーへ送信しない — 解析はクライアント完結
- design.md §8 の正規ルート: `/`・`/proposal`・`/syllabus`・`/syllabus/[code]`・`/mydata`・`/privacy`（PC・モバイル共通。`/import` は `/` への転送のみ）
- `lib/chat.ts` の `courseMessages` フィールドは design.md §5.2.2 では `syllabusPerCourse` として定義されているが、実装名が異なる（機能は同等）
- SSE は `fetch` + `ReadableStream` 方式で実装済み。`lib/chatApi.ts` の `readSSE` 共通ヘルパー経由で全チャット系エンドポイントに対応
- 時間割表は PC・モバイルとも `lib/timetable.ts` の `coursesToSlotTable` を使う（`TimetablePanel.tsx` / `app/_components/TimetableGrid.tsx`）。`coursesToTimetable` はどの画面からも使っていない
- 検索結果のタグは2段（`buildTagMap()` で候補 → `resolveTags()` で履修可否を掛けて3軸に決める）。入口は `lib/useTagMap.ts` の `useTagMap()` だけで、**`Map` ではなく関数を返す**（呼び出し側が2段目を掛け忘れないため。`Map` に戻さない）— 設計書 §6.1.3
- 履修可否の判定規則は設計書 §6.1.3 に1か所で書き、実装は frontend（`lib/eligibility.ts`）と backend（`proposal_agent.py` の `fetch_eligibility()`）の2か所にある。取得経路が違うため実装は分かれる。**片方だけ直さないこと**
- 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は課程名なので `lib/programs.ts` でコードに解決する — design.md §4.4.2
