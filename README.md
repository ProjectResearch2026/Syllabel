# Syllabel

龍谷大学先端理工学部の学生に向けた**履修登録支援AIチャットボット**。学年・課程・既修得科目から次学期の時間割を提案し、シラバスについての質問に答える。龍谷大学プロジェクトリサーチの成果物として開発しているプロトタイプであり、龍谷祭での展示を当面のゴールとする。

推論には学内サーバ(DGX Spark)上のローカル LLM(vLLM + Qwen3.8-27B-FP8)を使う。**学外のクラウドAIサービスは利用せず、成績データを学外へ出さない。**

- 要件定義書: [docs/requirements.md](docs/requirements.md)
- 設計書: [docs/design.md](docs/design.md)(目次と改訂履歴。本文は `docs/design/01-07`)

## 機能

| # | 機能 | 概要 |
|---|---|---|
| 1 | 学生情報の入力 | 成績表PDFから学年・課程・既修得科目を取り込む(成績表なしで試すときはデモの学生を選ぶ)。取り込んだ内容はマイデータで訂正できる。PDF の解析はブラウザ内で完結し、ファイルをサーバへ送らない |
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
| 公開 VM(アドバイザー教員研究室の Web サーバ上) | gateway(Caddy。振り分け)、frontend(Next.js)、backend(FastAPI + PydanticAI)。TLS 終端は VM の外側、教員側の管理範囲 |
| DGX Spark(学内) | vllm、api-clean・postgres-clean(シラバスバックエンド。fork 元に2026年度のデータを投入し、本サービス向けに改修したもの) |

学生のブラウザは gateway だけにアクセスし、`/syllabel` と `/syllabel/*` は frontend、`/syllabel/api/*` は backend へ振り分けられる(公開パスは `/syllabel` 配下のサブパス)。シラバス情報は backend が api-clean を中継して返し、api-clean 自体は公開しない。

## リポジトリ構成

```
backend/              FastAPI + PydanticAI。API・エージェント・履修要項データ層
frontend/             Next.js(App Router)。画面と PDF 解析
curricula/            履修要項(入学年度 × 課程)の YAML。手動転記
offerings/            開講年度ごとの「科目名 → シラバスコード」
docs/                 要件定義書・設計書・各種ルール
ui-ux/                画面デザイン
docker-compose.yml    DGX Spark 側(vllm のみ。backend は公開 VM に置く。設計§3.2.2)
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
| `VLLM_BASE_URL` | `http://vllm:8000/v1` | LLM(OpenAI 互換)の宛先。トークンゲートウェイ経由の場合はその URL(設計§3.4.3) |
| `LLM_MODEL_ID` | `qwen3.8-27b-fp8` | 接続先が返すモデル ID と一致させる(不一致で 404) |
| `LLM_REASONING_EFFORT` | `low` | 会話の思考の長さ(`xhigh` / `medium` / `low`)。設計§6.3.1 の実測で `xhigh` は応答が分単位で伸びたため `low` を既定とする |
| `LLM_API_KEY` | `EMPTY` | ゲートウェイが要求するトークン。`Authorization: Bearer <値>` として送られる(設計§6.3)。認証なしの vllm を直接叩くときは既定のまま |
| `API_CLEAN_BASE_URL` | `http://api-clean:5000` | 既存シラバス API の宛先。トークンゲートウェイ経由の場合はその URL(設計§3.4.4) |
| `API_CLEAN_API_KEY` | (空) | ゲートウェイが要求するトークン。`Authorization: Bearer <値>` として送られる(設計§6.2)。認証なしの api-clean を直接叩くときは空のまま(ヘッダを付けない) |
| `CURRICULA_DIR` / `OFFERINGS_DIR` | `../curricula` / `../offerings` | 履修要項データの場所 |
| `OFFERING_YEAR` | `2026` | 参照する開講年度。過去年度は読まない |

チャットと履修提案は vllm と api-clean が動いていないと使えない。ユニットテストはどちらもモックするため、単体では外部を必要としない。

### frontend

```bash
cd frontend
npm install
npm run dev                        # http://localhost:3000/syllabel
```

`next.config.ts` の `basePath` によりサブパス配信になっている。`basePath` は `fetch()` のパスには前置されないため、**backend への呼び出しは公開パスの `/syllabel/api/*` を明示的に含める**(設計§3.5.2、§6.1)。宛先の解決は `lib/api_base.ts` の `apiBase()` に集約してあり、ブラウザからは同一オリジンの `/syllabel/api`、サーバ側描画(RSC)からは backend のオリジンを直に引く。

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `BACKEND_ORIGIN` | 開発時 `http://localhost:8000` / 本番 `http://syllabel-backend:8000` | サーバ側描画から引く backend のオリジン。公開 VM では Quadlet の環境ファイルで与える(設計§3.2.1)。**渡さないと既定にフォールバックする** |

開発時はゲートウェイが居ないため、ブラウザからの `/syllabel/api/*` は `next.config.ts` の `rewrites()` が `BACKEND_ORIGIN` へ中継する(本番ではゲートウェイが振り分けるため無効)。上の backend 開発サーバを立てておけば、そのまま疎通する。

### ローカル開発環境(シラバス検索まで一式)

**公開デプロイを挟まずに、手元で画面を見ながら開発できる。** シラバス検索・講義詳細・履修要項のタグ表示までが実データで動く。vllm は立てないので、チャットと履修提案は使えない(その2つは実機で確かめる)。

必要なもの: docker (compose v2)、Python 3.12 以上、Node.js。

**1. シラバスバックエンド(api-clean + Postgres)を立てる。** 別リポジトリ [ProjectResearch2026/syllabus_backend](https://github.com/ProjectResearch2026/syllabus_backend) が、シラバスの元データ(xlsx)ごと持っている。初回だけ:

```bash
git clone https://github.com/ProjectResearch2026/syllabus_backend ../syllabus_backend
cd ../syllabus_backend
bin/init_clean.sh --years 2026     # Postgres 起動 → スキーマ作成 → 2026年度データ投入
```

`http://localhost:5050/docs` が開けば成功(Postgres は `localhost:5433`)。2回目以降は `docker compose -f docker-compose.clean.yml up -d` だけでよい。投入されるのは先端理工学部を含む1,512件(2026年度)で、`Y00…` の専攻科目と `G26…` の教養教育科目がどちらも入る。

**2. backend と frontend を起動する。**

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"   # 初回だけ
cd ../frontend && npm install                                             # 初回だけ

cd .. && scripts/dev.sh
```

`scripts/dev.sh` は api-clean の死活を確かめてから、backend(`uvicorn --reload`)と frontend(`next dev`)を一緒に立ち上げる。**どちらもソースを保存すれば自動で反映される**ので、PR・マージ・デプロイを回さずに変更を確認できる。Ctrl-C で両方止まる。

| URL | 中身 |
|---|---|
| `http://localhost:3000/syllabel/syllabus` | 画面 |
| `http://localhost:8000/api/healthz` | backend |
| `http://localhost:5050/docs` | api-clean(Swagger UI) |

宛先を変えたいときは `API_CLEAN_BASE_URL` / `BACKEND_ORIGIN` / `BACKEND_PORT` を環境変数で渡す。

**frontend だけを触るなら backend も要らない。** 公開中の backend を宛先にすれば、DB もシラバスリポジトリも無しで画面の開発ができる(サーバ側描画・ブラウザの両方がこの宛先を使う。設計§6.1)。

```bash
cd frontend && BACKEND_ORIGIN="https://<公開ホスト>/syllabel" npm run dev
```

### 実機スモーク

vllm・api-clean を相手にした疎通確認は `backend/scripts/smoke_*.py` を手で実行する(pytest の対象外。設計§12.3)。

接続先は環境変数で与える(上表)。**backend は compose に無い**ため、コンテナ越しに
実行する場合は公開 VM の rootless Podman を使う(docker は入っていない。設計§3.2)。

```bash
# 手元で直接動かす(backend/ を cwd に、接続先は環境変数か backend/.env で与える)
cd backend
python -m scripts.smoke_vllm
python -m scripts.smoke_api_clean
python -m scripts.smoke_chat_syllabus <講義コード>
python -m scripts.smoke_timetable build '{"freeDayCount": 1}'   # 組み立てだけ(モデルを呼ばない)
python -m scripts.smoke_timetable chat "週に1日は全休にしたい"   # 時間割のアシスタント

# 公開 VM の backend コンテナ内で動かす
podman exec -it syllabel-backend python -m scripts.smoke_api_clean
```

時間割の組み立て(`build`)はモデルを呼ばず数秒で返る。アシスタント(`chat`)はツール呼び出しを挟んでモデル呼び出しが2回以上になる(設計§7.2・§7.3)。

## 実装状況(2026-10-23)

| 領域 | 状況 |
|---|---|
| backend / シラバス | `GET /api/syllabi`・`/api/syllabi/{code}`・`/api/masters`(api-clean 中継)実装済み |
| backend / チャット | `POST /api/chat/syllabus`・`/api/chat/syllabus/{code}` 実装済み(シラバスを探すツール `search_courses` / `get_course` は時間割のアシスタントと共有) |
| backend / 履修要項 | YAML スキーマ・ロード・マージ・要件充足判定、`GET /api/curricula/{program_code}/{admission_year}`・`POST /api/requirements` 実装済み |
| backend / 時間割 | `POST /api/timetable/build`(組み立て。モデルを呼ばない)・`/check`(レポート)・`/assistant`(会話。SSE)実装済み。組み立ては実データ(ダミー学生48人)で確認済み。アシスタントの実機での確認は未実施(設計§13) |
| frontend | 全画面を実装済み。backend との接続は設計§6.1 の宛先・SSE 書式・スキーマに準拠(`lib/api_base.ts` / `lib/chatApi.ts` / `lib/syllabus-api.ts`) |
| 履修要項データ | 2023〜2026年度入学の6課程 + 教養教育科目を作成済み |
| 開講年度データ | 2026年度分を作成済み(api-clean のシラバスと突き合わせて手で作成) |
| インフラ | frontend は学外から HTTPS で到達できる。**`/syllabel/api/*` も公開 URL で疎通済み**(学生ブラウザ → 入口 Caddy → gateway → backend → トークンゲートウェイ → api-clean。設計§3.4.4)。frontend コンテナには `BACKEND_ORIGIN` を環境ファイルで渡す(設計§3.2.1)。CI は未整備 |

## 開発ルール

- **ブランチ名**: `<担当者>/<種別>/<内容>`(例: `shimizu/feature/chat-agent`)
- **コミットメッセージ**: [docs/format/commit_rule.md](docs/format/commit_rule.md)
- **命名規則**: [docs/format/naming_rule.md](docs/format/naming_rule.md)
- **設計書に従う**: 実装の前に該当する節を読む。設計と食い違う実装を入れる場合は、設計書側も同じ PR で更新する(§番号とファイルの対応は [docs/design.md](docs/design.md) の 0.3)
- **`curricula/` の変更は PR でアドバイザー教員の承認が要る**(要件§8、設計§4.4.4)。履修要項の転記物であり、内容の正確性は監修で担保するため。確定後は誤記の修正を除いて編集しない
- **`offerings/` はアドバイザー教員のレビュー対象外**(履修要項の転記物ではなく、開発チームが api-clean のシラバスと突き合わせて作成した名寄せ結果)

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
