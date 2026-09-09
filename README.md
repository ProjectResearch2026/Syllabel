# CourseRegistrationAI

龍谷大学先端理工学部の学生に向けた**履修登録支援AIチャットボット**。学年・課程・既修得科目から次学期の時間割を提案し、シラバスについての質問に答える。龍谷大学プロジェクトリサーチの成果物として開発しているプロトタイプであり、龍谷祭での展示を当面のゴールとする。

推論には学内サーバ(DGX Spark)上のローカル LLM(vLLM + Qwen3.6-27B-FP8)を使う。**学外のクラウドAIサービスは利用せず、成績データを学外へ出さない。**

- 要件定義書: [docs/requirements.md](docs/requirements.md)
- 設計書: [docs/design.md](docs/design.md)(目次と改訂履歴。本文は `docs/design/01-07`)

## 機能

| # | 機能 | 概要 |
|---|---|---|
| 1 | 学生情報の入力 | 学年・課程・既修得科目を手入力するか、成績表PDFから取り込む。PDF の解析はブラウザ内で完結し、ファイルをサーバへ送らない |
| 2 | 履修登録の提案 | 卒業要件の充足状況・履修登録単位数の上限・開講曜日時限を踏まえ、次学期の時間割を提案する |
| 3 | 提案チャット | 提案の理由や組み替えについて対話する |
| 4 | 独自シラバス | シラバスを検索し、その学生にとっての「必修 / 選択 / 既修得済み」をタグ表示する |
| 5 | シラバスチャット | シラバス全体、または講義ページ単位で質問する |

## プライバシー

プロトタイプとして認証を持たない代わりに、**学生のデータをサーバに残さない**設計を採る(要件§5、設計§9)。

- 学生プロファイル・対話履歴はブラウザのメモリ(Zustand、永続化オフ)にのみ置き、リロードやタブを閉じた時点で消える
- backend に DB は無い。リクエストで受け取った学生データはプロンプトの組み立てに使うだけで、永続化もログ記録もしない
- 成績データの処理は学内(ブラウザと DGX Spark)で完結する

## 構成

6つの構成要素を2ホストに分けて配置する(設計§1、§3)。

| ホスト | 稼働させるもの |
|---|---|
| GW 機(アドバイザー教員研究室) | gateway(nginx。TLS 終端と振り分け)、frontend(Next.js) |
| DGX Spark(学内) | backend(FastAPI + PydanticAI)、vllm、api-clean・postgres-clean(既存のシラバスバックエンド。無変更で利用) |

学生のブラウザは gateway だけにアクセスし、`/` は frontend、`/api/*` は backend へ振り分けられる。シラバス情報は backend が api-clean を中継して返し、api-clean 自体は公開しない。

## リポジトリ構成

```
backend/              FastAPI + PydanticAI。API・エージェント・履修要項データ層
frontend/             Next.js(App Router)。画面と PDF 解析
curricula/            履修要項(入学年度 × 課程)の YAML。手動転記
offerings/            開講年度ごとの「科目名 → シラバスコード」
docs/                 要件定義書・設計書・各種ルール
ui-ux/                画面デザイン
docker-compose.yml    DGX Spark 側(backend + vllm)
```

`curricula/` と `offerings/` を分けているのは、**入学年度で決まって変わらないデータ(卒業要件・科目区分・設置科目)と、開講年度ごとに変わるデータ(シラバスコード)を混ぜないため**である(設計§4.4.1)。両者は科目名で結合する。

## 開発

### backend

Python 3.12 以上が要る。

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"            # uv なら: uv pip install -e ".[dev]"

python -m pytest                   # ユニットテスト。vllm・api-clean はモックする
uvicorn app.main:app --reload      # 開発サーバ(http://localhost:8000)
```

起動時にリポジトリ直下の `curricula/` と `offerings/` を読み、スキーマと整合性を検査する。転記ミスがあれば**起動に失敗する**(設計§4.4.3)。設定は環境変数か `backend/.env` で与える(既定値は `app/settings.py`)。

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `VLLM_BASE_URL` | `http://vllm:8000/v1` | vllm(OpenAI 互換)の宛先 |
| `LLM_MODEL_ID` | `qwen3.6-27b-fp8` | vllm の `--served-model-name` と一致させる(不一致で 404) |
| `API_CLEAN_BASE_URL` | `http://api-clean:5000` | 既存シラバス API の宛先 |
| `CURRICULA_DIR` / `OFFERINGS_DIR` | `../curricula` / `../offerings` | 履修要項データの場所 |
| `OFFERING_YEAR` | `2026` | 参照する開講年度。過去年度は読まない |

チャットと履修提案は vllm と api-clean が動いていないと使えない。ユニットテストはどちらもモックするため、単体では外部を必要としない。

### frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:3000/pr-2026
```

`next.config.ts` の `basePath` によりサブパス配信になっている。backend への呼び出しは `/api/*`(絶対パス)で行うため、開発時は同一オリジンで backend へ届く経路を用意する必要がある。

### 実機スモーク

vllm・api-clean を相手にした疎通確認は `backend/scripts/smoke_*.py` を手で実行する(pytest の対象外。設計§12.3)。

```bash
docker compose up -d
docker compose exec backend python -m scripts.smoke_vllm
docker compose exec backend python -m scripts.smoke_api_clean
docker compose exec backend python -m scripts.smoke_chat_syllabus <講義コード>
docker compose exec backend python -m scripts.smoke_proposal
```

履修提案は1回に4〜5分かかる。応答時間は出力トークン数でほぼ決まる(設計§7.2)。

## 実装状況(2026-09-09)

| 領域 | 状況 |
|---|---|
| backend / シラバス | `GET /api/syllabi`・`/api/syllabi/{code}`・`/api/masters`(api-clean 中継)実装済み |
| backend / チャット | `POST /api/chat/syllabus`・`/api/chat/syllabus/{code}` 実装済み。**`POST /api/chat/proposal` は未実装** |
| backend / 履修要項 | YAML スキーマ・ロード・マージ・要件充足判定、`GET /api/curricula/{program_code}/{admission_year}`・`POST /api/requirements` 実装済み |
| backend / 履修提案 | `POST /api/proposal` 実装済み(SSE で逐次配信)。実機で提案の生成を確認済み |
| frontend | 全画面と backend との接続を実装済み |
| 履修要項データ | 2024・2025年度入学の6課程 + 教養教育科目を作成済み。2026年度入学分は転記中 |
| 開講年度データ | 2026年度分を作成済み。生成スクリプト(`scripts/build_offerings.py`)は未実装 |
| インフラ | GW 機・gateway・CI は未整備。backend の 8000 は現状 loopback バインド |

## 開発ルール

- **ブランチ名**: `<担当者>/<種別>/<内容>`(例: `shimizu/feature/chat-agent`)
- **コミットメッセージ**: [docs/format/commit_rule.md](docs/format/commit_rule.md)
- **命名規則**: [docs/format/naming_rule.md](docs/format/naming_rule.md)
- **設計書に従う**: 実装の前に該当する節を読む。設計と食い違う実装を入れる場合は、設計書側も同じ PR で更新する(§番号とファイルの対応は [docs/design.md](docs/design.md) の 0.3)
- **`curricula/` の変更は PR でアドバイザー教員の承認が要る**(要件§8、設計§4.4.4)。履修要項の転記物であり、内容の正確性は監修で担保するため。確定後は誤記の修正を除いて編集しない
- **`offerings/` はレビュー対象外**(api-clean からの機械生成物)

## ドキュメント

| 文書 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 要件定義書。サービスが満たすべき要件 |
| [docs/design.md](docs/design.md) | 設計書の目次と改訂履歴 |
| [docs/design/01-architecture.md](docs/design/01-architecture.md) | §1 システム全体構成 / §2 技術スタック |
| [docs/design/02-deployment.md](docs/design/02-deployment.md) | §3 デプロイ構成・アクセス制御 |
| [docs/design/03-components.md](docs/design/03-components.md) | §4 コンポーネント設計(frontend / backend / vllm / 履修要項データ層) |
| [docs/design/04-data.md](docs/design/04-data.md) | §5 データ設計(履修要項スキーマ・クライアント状態・提案の出力) |
| [docs/design/05-interfaces.md](docs/design/05-interfaces.md) | §6 API設計 / §7 主要シーケンス / §8 画面構成 |
| [docs/design/06-nonfunctional.md](docs/design/06-nonfunctional.md) | §9 プライバシー / §10 非機能 / §11 龍谷祭展示 |
| [docs/design/07-operations.md](docs/design/07-operations.md) | §12 開発・テスト方針 / §13 未確定事項 |
