# 履修登録支援AIチャットボット 設計書(v0.9.66)— §1 システム全体構成 / §2 技術スタック

> 本ファイルは [`docs/design.md`](../design.md) の一部である。§番号は設計書全体で通し番号であり、他ファイルの節を `§X.Y` の形で参照する。全ファイルの対応表は [design.md](../design.md) の「0.3 本書の構成」を参照。

---

## 1. システム全体構成

### 1.1 構成要素

サービスは以下の5つのコンテナで構成する。frontend / backend / vllm の3つを本プロジェクトのリポジトリで新規開発し、api-clean / postgres-clean はシラバスバックエンドのものを使う。

| 要素 | 役割 | 実装 | リポジトリ |
|---|---|---|---|
| frontend | 学生が触れる Web UI | Next.js(React + TypeScript) | 本リポジトリ(新規開発) |
| backend | フロントと LLM/シラバスAPI を仲介し、履修提案ロジックを担う | FastAPI(Python)+ PydanticAI | 本リポジトリ(新規開発) |
| vllm | ローカル LLM 推論サーバ | vLLM、Qwen3.8-27B-FP8 | 既製品(設定のみ) |
| api-clean | シラバス情報提供 API | FastAPI | シラバスバックエンド(§1.1.1) |
| postgres-clean | シラバス DB | PostgreSQL | シラバスバックエンド(§1.1.1) |

これらに加え、公開入口として gateway を新規に構築する。

| 要素 | 役割 | 実装 | リポジトリ |
|---|---|---|---|
| gateway | 公開する唯一の入口(学外からのアクセスも受ける)。リクエストを**同一 VM 上の** frontend と backend へ振り分ける | 公開 VM 上の **Caddy** | 本リポジトリ(設定のみ) |

さらに、本プロジェクトが管理しない外部要素を2つ経由する。

| 要素 | 役割 | 管理 |
|---|---|---|
| トークンゲートウェイ | 発行されたトークンを検証し、DGX Spark 上のサービスへ中継する。**backend はこれを経由して vllm と api-clean の双方を呼ぶ** | アドバイザー教員(学内。**vllm 向けはプロンプトと応答を100日間記録する**。要件§5.2・§5.5) |
| openBD | ISBN から書影の URL を返す公開 API。**講義詳細の書影にのみ使う**(§6.4) | 版元ドットコム / カーリル(**学外**。認証なし) |

**openBD はこの構成で唯一の学外要素であり、学生データの経路には乗らない。** frontend のサーバ側描画が ISBN だけを投げ、画像はブラウザが直接引く。引けなくても講義詳細は書影なしで描く(§6.4、§9)。

これら6要素を2つのホストに分けて配置する。GW 側は、教員側が管理するホストと、その上に払い出されたゲスト VM の2層になる(§3.1)。

| ホスト | 設置場所 | 稼働させる要素 |
|---|---|---|
| **公開 VM**(GW ホスト上の libvirt ゲスト) | アドバイザー教員研究室 | gateway、frontend、**backend** |
| **DGX Spark** | 学内 | **vllm、api-clean、postgres-clean** |

**公開 VM には本プロジェクトが新規開発した要素を置き、他の担当が運用する資産(シラバスバックエンド)と LLM 推論は DGX Spark に置く。** backend を公開 VM に置く理由は §3.4.2、シラバスデータ層を DGX Spark に置く理由は §3.4.4 による。

この配置により、**ホストを跨ぐ通信は backend を起点とする2本になる**。gateway → backend は公開 VM 内で閉じる。

| # | 区間 | 経路 | 節 |
|---|---|---|---|
| ★1 | backend → vllm | 公開入口コンテナ → トークンゲートウェイ → vllm。HTTPS + Bearer トークン | §3.4.3 |
| ★2 | backend → api-clean | 公開入口コンテナ → トークンゲートウェイ → api-clean。HTTPS + Bearer トークン | §3.4.4 |

**2本は同じ機構である。** いずれも教員側のトークンゲートウェイを経由し、backend から見れば「base_url とトークンを環境変数で与えて HTTP で叩く」という同一の形になる。**本プロジェクトが DGX Spark に固有のものを置くことはない**(§3.4.4)。公開するホストを GW 側1台に限ることで、不特定多数の学生からアクセスされるポートを DGX Spark 自身に開けずに済む。DGX Spark は本プロジェクト以外の用途にも使われているため、外部公開の範囲を GW 側に閉じ込める意味もある。**DGX Spark 上の vllm と api-clean はいずれもホストの loopback にバインドする**(§3.4、§3.4.4)。

学生のデータを処理する一連の機能(PDF 解析はブラウザ、提案・チャットは backend、推論は vllm)は**学内で完結する**。frontend は静的な画面配信とブラウザ内処理のためのコードを配るのみで、成績データを受け取らない。gateway も通信を中継するのみでデータの処理・保存・記録を行わない(要件§3.1、§5.5)。**一方、backend → vllm の経路にあるトークンゲートウェイは、プロンプトと応答を100日間記録する。** これは本プロジェクトの管理外であり、記録される内容を最小にする方針を §9 に置く。

**TLS 終端は GW ホスト側が担う。** 公開 VM は rootless コンテナ基盤のため 1024 未満のポートを待ち受けられず、80/443 の受けと証明書の管理は教員側の管理範囲にある(§3.1、§3.5.1、§3.5.3)。frontend は学外から HTTPS で到達できる。

#### 1.1.1 シラバスバックエンドの位置づけ

**api-clean / postgres-clean は「手を加えない外部システム」ではない。** 実体は [ProjectResearch2026/syllabus_backend](https://github.com/ProjectResearch2026/syllabus_backend)(上流 [RyukokuDX/syllabus_backend](https://github.com/RyukokuDX/syllabus_backend) のフォーク)であり、本サービスが必要とするデータと機能はこのリポジトリ側で用意される。**したがって本サービスの機能はシラバスバックエンド側の改修に依存する。**

本設計が api-clean に前提とするものは次のとおりである。

| 前提 | 内容 |
|---|---|
| 科目情報の参照 | `GET /syllabi` / `GET /syllabi/{code}` / `GET /masters` の3つを使う(§6.2) |
| 開講年度 | 2025・2026年度のデータが投入されていること |
| 課程の紐付け | `GET /syllabi/{code}` の `programs` が両年度で返ること |
| **取得できないもの** | **科目区分(必修/選択必修の別)。** `syllabus_attribute` が空であり、api-clean からは得られない。履修要項 YAML が科目区分の唯一の情報源である根拠(§4.4)であり、§7.4.1 規則5 の根拠でもある |

**改修は本リポジトリでは行わない。** 必要な改修は当該リポジトリへ起票する。責任分界は §3.5.3、依存している未解決事項は §13 による。

### 1.2 アーキテクチャ図

```mermaid
%% エッジラベルは必ず "..." で囲む。丸括弧を裸で書くと GitHub 上で
%% parse エラー(Unable to render rich display)になる。
flowchart TB
    Browser["学生のブラウザ<br/>(PDF解析 + 状態保持)"]

    subgraph GWH["GW ホスト(アドバイザー教員研究室・教員側管理)"]
      Edge["公開入口(Incus コンテナ)<br/>Caddy :443 TLS終端"]
      TokenGW["トークンゲートウェイ(別VM)<br/>トークン検証<br/>★vllm 向けは<br/>プロンプトと応答を100日記録"]
      subgraph VM["公開 VM(本プロジェクト・root 権限なし)"]
        Gateway["gateway<br/>Caddy :8080(振り分け)"]
        Frontend["frontend<br/>Next.js :3000"]
        Backend["backend<br/>FastAPI + PydanticAI"]
      end
    end

    subgraph DGX["DGX Spark(学内)"]
      VLLM["vllm<br/>Qwen3.8-27B-FP8"]
      APIClean["api-clean<br/>FastAPI(シラバスBE)"]
      PG["postgres-clean<br/>PostgreSQL(シラバスBE)"]
    end

    Browser -->|"HTTPS"| Edge
    Edge -->|"HTTP"| Gateway
    Gateway -->|"HTTP<br/>/syllabel, /syllabel/* を VM 内で配信"| Frontend
    Gateway -->|"HTTP / SSE<br/>/syllabel/api/* を /api/* に直して VM 内で中継"| Backend
    Frontend -.->|"HTTP<br/>サーバ側描画時(§6.1)"| Backend
    Backend -->|"HTTPS + Bearer トークン<br/>★1 / ★2 入口コンテナ経由(§6.3)"| Edge
    Edge -->|"/spark/* を中継"| TokenGW
    TokenGW -->|"HTTP<br/>★1 教員側の中継(§3.4.1)"| VLLM
    TokenGW -->|"HTTP<br/>★2 許可パスのみ(§3.4.4)"| APIClean
    APIClean --> PG
```

ゲートウェイは単一の公開オリジンとして振る舞い、`/syllabel`・`/syllabel/*` を frontend へ、`/syllabel/api/*` を backend へ振り分ける。**いずれも同一 VM 内である**(振り分けの実体は §3.2.1、URL 構造の規定は §3.5.2)。ブラウザから見た通信相手は常にゲートウェイの1オリジンに統一されるため、backend を別オリジンとして直接公開する必要がなく、CORS の考慮も不要になる。

**公開パスは `/` ではなく `/syllabel` 配下である。** GW ホストは他用途と共用されており、ルートを本プロジェクトが占有できないためである。backend へ向かうパスも `/syllabel/api/*` であり、`/api/*` ではない(§3.5.2)。

### 1.3 データの流れ

要件§5.4のデータフロー図を各コンポーネントの責務に基づいて具体化する。ブラウザから backend への通信(下記2以降)はすべてゲートウェイを経由する。ゲートウェイは振り分けのみを担い、リクエスト/レスポンスの内容を保存・記録しない。

1. 学生がブラウザで成績表PDFを選択 → frontend 内の PDF.js でテキスト抽出 → ブラウザのメモリ(Zustand store)に学生プロファイルとして保持
2. 履修提案要求 → backend が学生プロファイル + 履修要項データ + **api-clean から取得した開講情報**を組み立て、**トークンゲートウェイ経由で** vllm に推論依頼 → PydanticAI が構造化出力(時間割形式)を強制
3. 提案表示後のチャット → backend が会話履歴 + 必要に応じて api-clean を tool calling で参照しつつ、vllm から応答を生成 → SSE で frontend へストリーミング
4. シラバスチャット → 同様に tool calling で api-clean を呼びながら、vllm から応答を生成

本プロジェクトの各要素はデータ永続化を一切行わず、ブラウザを閉じれば消える(要件§5.2)。**ただし 2〜4 で vllm へ渡したプロンプトと応答は、経路上のトークンゲートウェイに100日間記録される**(要件§5.2・§5.5、§9)。記録される内容を最小にするため、プロンプトには氏名・学籍番号・評語・GPA を含めず、修得済み科目の一覧も渡さない(§7.2.1)。**api-clean へ送るのは科目の検索条件のみであり、学生プロファイルは渡さない**(§6.2)。

---

## 2. 技術スタック

| レイヤ | 技術 | 補足 |
|---|---|---|
| 言語(フロント) | TypeScript | |
| 言語(バックエンド) | Python 3.12+ | |
| Webフレームワーク(フロント) | Next.js(App Router) | |
| Webフレームワーク(バックエンド) | FastAPI | |
| ASGI サーバ | Uvicorn | |
| UIライブラリ | Tailwind CSS | 画面部品は自前実装 |
| アイコン・アニメーション | lucide-react、motion | |
| クライアント状態管理 | Zustand | 永続化機能はオフ(要件§5.2) |
| サーバ通信 | `fetch`(SSE は `ReadableStream` を自前で読む) | |
| PDF解析 | pdfjs-dist(PDF.js) | クライアント側で実行 |
| AI回答の描画 | react-markdown(+ remark-gfm / remark-breaks) | 生の HTML は描かない(§4.1.5) |
| LLMオーケストレーション | PydanticAI | 構造化出力・ツール呼び出し |
| LLM推論サーバ | vLLM | OpenAI 互換 API を提供 |
| ストリーミング | SSE(Server-Sent Events) | vLLM のストリーミングをそのまま中継 |
| 履修要項データ管理 | YAML + Git 管理 | アプリ起動時にメモリへロード |
| コンテナ | DGX Spark は Docker + docker compose、公開 VM は rootless Podman | ホストで基盤もアーキテクチャ(arm64 / x86_64)も異なる(§3.2) |

**UI 部品ライブラリ(shadcn/ui 等)とサーバ状態のキャッシュ(TanStack Query 等)は採用しない。** 画面は8本(§8)で、サーバから取る読み取り専用データはシラバス(検索結果・詳細・値マスタ)と履修要項に限られ、`fetch` と Zustand で足りる。チャット・履修提案は SSE であり、いずれにせよキャッシュライブラリの管轄外である。採用するのは、同じ問い合わせを複数の画面が共有し再取得の制御が要るようになった時点とする。

### 2.1 LLMモデル

- 暫定: Qwen3.8-27B-FP8(vLLM 経由)
- API形式: OpenAI 互換 ChatCompletion(`/v1/chat/completions`、stream 対応、tool calling 対応)
- モデルは確定次第、本節と§4.3を更新する
