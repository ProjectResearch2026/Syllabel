# 履修登録支援AIチャットボット 設計書(v0.9.4)— §3 デプロイ構成

> 本ファイルは [`docs/design.md`](../design.md) の一部である。§番号は設計書全体で通し番号であり、他ファイルの節を `§X.Y` の形で参照する。全ファイルの対応表は [design.md](../design.md) の「0.3 本書の構成」を参照。

---

## 3. デプロイ構成

### 3.1 配置先

配置は2ホストに分かれる。

- **GW 機**(アドバイザー教員研究室) — gateway(nginx)と frontend。学外へ公開する唯一のホスト
- **DGX Spark**(学内) — backend / vllm、および既存シラバスバックエンド(api-clean / postgres-clean)

学生データを処理する一連の機能は、ブラウザと DGX Spark 上で完結する(要件§3.1)。GW 機は画面の配信と通信の中継のみを担い、成績データの処理・永続保存・記録を行わない。

公開する入口は GW 機に限定する。学生のブラウザは GW 機にのみアクセスし、DGX Spark へは直接到達しない。学外(自宅等)からのアクセスも RINS へのファイアウォール制限解除申請により許可する。これにより、不特定多数の学生がアクセスするポートを DGX Spark 自身に開けずに済む。なお、アクセス経路を学外に公開することと、学生データの処理を学外へ出さないこと(要件§3.1)は別概念であり、後者は引き続き担保する(成績データの処理・保存は DGX 上で完結し、学外クラウドへ送信しない)。

frontend を DGX Spark ではなく GW 機に置くのは、外部からアクセスされる資産(画面配信)を公開ホスト側にまとめ、DGX Spark 側で開けるポートを backend の1つだけに絞るためである。本プロジェクトが GW 機で動かすのは nginx と Next.js だけであり、高いスペックを要さない。一方、GPU を要する vllm と、それを呼ぶ backend は DGX Spark 側から動かせない。

### 3.2 docker compose 構成

frontend が GW 機、backend / vllm が DGX Spark と別ホストに分かれるため、compose ファイルも2つに分ける。既存のシラバスバックエンド(`docker-compose.clean.yml`)には一切手を加えない。

| ファイル | 実行ホスト | 定義するサービス |
|---|---|---|
| `docker-compose.gw.yml` | GW 機 | gateway、frontend |
| `docker-compose.dgx.yml` | DGX Spark | backend、vllm |

サービス間通信は以下のネットワークで成立する:

- **gw-net**(GW 機) — gateway ↔ frontend。`docker-compose.gw.yml` が自動作成
- **app-net**(DGX Spark) — backend ↔ vllm。`docker-compose.dgx.yml` が自動作成
- **syllabus-clean-net**(既存・DGX Spark) — backend が api-clean を呼ぶための共有ネットワーク。`external: true` で参照

backend のみ app-net と syllabus-clean-net の両方に参加し、橋渡しを担う。ホストをまたぐ通信(gateway → backend、frontend → backend)は Docker network では解決できないため、DGX Spark のアドレスとホスト公開ポート 8000 を環境変数で与える(§3.4)。

`docker-compose.gw.yml`(抜粋):

```yaml
services:
  gateway:
    image: nginx:alpine
    ports:
      - "80:80"                       # 証明書取得(HTTP-01)および HTTPS へのリダイレクト用
      - "443:443"
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks: [gw-net]
    depends_on: [frontend]

  frontend:
    build: ./frontend
    networks: [gw-net]
    environment:
      - BACKEND_ORIGIN=http://<DGX Spark のアドレス>:8000   # サーバ側描画から backend を呼ぶ際の宛先

networks:
  gw-net:
```

`docker-compose.dgx.yml`(抜粋):

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"                  # GW 機から到達させるため公開(§3.4)
    networks:
      - app-net
      - syllabus-clean-net
    depends_on:
      vllm:
        condition: service_healthy   # モデルロード完了(数分)を待ってから起動

  vllm:
    image: vllm/vllm-openai:latest   # vLLM >= 0.19.0 が必須(Qwen3.6対応)。DGX 上の現行は 0.20.0
    networks: [app-net]
    ports:
      - "127.0.0.1:8001:8000"        # デバッグ用のみ。全公開を避け 127.0.0.1 バインド
    ipc: host                        # vLLM のマルチプロセス共有メモリ用(または shm_size 指定)
    volumes:
      - /srv/qwen3.6/models/Qwen3.6-27B-FP8:/models:ro   # 事前DL済みモデルを読み取り専用で渡す
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 30s
      timeout: 5s
      retries: 30
      start_period: 900s             # モデルロードに数分かかるため長めに
    command:
      - --model
      - /models                       # 事前DLしたローカルパス。起動時に HF からは取得しない
      - --served-model-name          # §6.3 の OpenAIChatModel(model=...) と一致させ 404 を防ぐ
      - qwen3.6-27b-fp8
      - --language-model-only         # テキスト専用。ビジョンを省きメモリを KV cache に回す
      - --reasoning-parser            # 思考モデルのため必須。無いと思考が本文に漏れ構造化出力が壊れる
      - qwen3
      - --enable-auto-tool-choice
      - --tool-call-parser            # hermes ではなく qwen3_coder(公式指定の出力書式)
      - qwen3_coder
      - --max-model-len               # 既定262144はメモリ過大。最低128K推奨に沿い131072。OOM時さらに削減
      - "131072"
      - --gpu-memory-utilization      # 同一GPUを共有する他ワークロードがある前提で 121GiB に収めるため 0.4(≒48GB)
      - "0.4"
      # 単GPU構成のため tensor-parallel は指定しない(=1)

networks:
  app-net:
  syllabus-clean-net:
    external: true
    name: syllabus_backend_syllabus-clean-net
```

vllm のモデルはイメージ内に持たず、ホストの `/srv/qwen3.6/models/Qwen3.6-27B-FP8` に**事前DL**したものを読み取り専用で bind mount する。コンテナ起動時に HuggingFace から取得しないため、Docker 名前付きボリュームは使わない。

### 3.3 起動順序

0. (初回のみ) vllm 用モデルを事前DL: `/srv/qwen3.6/models/Qwen3.6-27B-FP8` を作成し、`hf download Qwen/Qwen3.6-27B-FP8 --revision <commit SHA> --local-dir /srv/qwen3.6/models/Qwen3.6-27B-FP8`(§4.3)
1. (DGX Spark)シラバスバックエンド側で `bin/init_clean.sh`(初回のみデータ投入込み)、以降は `docker compose -f docker-compose.clean.yml up -d`
2. (DGX Spark)`docker compose -f docker-compose.dgx.yml up -d`
3. (GW 機)`docker compose -f docker-compose.gw.yml up -d`

GW 機側は DGX Spark 側の起動完了を待たずに立ち上がるが、backend が未起動の間は API 呼び出しが失敗するため、上記の順序で起動する。

### 3.4 ポート割り当て(暫定)

**GW 機**

| サービス | コンテナ内 | ホスト公開 |
|---|---|---|
| gateway | 80 / 443 | 80 / 443 |
| frontend | 3000 | 公開しない(gateway から gw-net 経由で参照) |

**DGX Spark**

| サービス | コンテナ内 | ホスト公開 |
|---|---|---|
| backend | 8000 | 8000 |
| vllm | 8000 | 8001 |
| api-clean(既存) | 5000 | 5050 |
| postgres-clean(既存) | 5432 | 5433 |

コンテナ内ポートは各サービスの標準値に従っている(Next.js は 3000、FastAPI/Uvicorn と vLLM は 8000、PostgreSQL は 5432、api-clean は既存設定の 5000)。ホスト公開ポートは、backend と vllm がコンテナ内で同じ 8000 を使うためホスト側で vllm を 8001 にずらしている。postgres-clean の 5433 は、ホスト上で別の PostgreSQL が動いている場合を想定した 5432 との衝突回避である(既存設定そのまま)。

同一ホスト内のコンテナ間通信はホスト公開ポートではなく Docker network 経由(サービス名:コンテナ内ポート、例: `http://vllm:8000`、`http://frontend:3000`)で行う。ホストをまたぐ通信(GW 機 → backend)のみ、DGX Spark のアドレスとホスト公開ポート 8000 を用いる。

学生のブラウザは DGX Spark のホスト公開ポートには直接アクセスしない。GW 機からの振り分け先となる backend(8000)のみ DGX Spark のホスト側に公開する。frontend が GW 機側に移ったため、DGX Spark 側で 3000 を公開する必要はない。残りの vllm(8001)・api-clean(5050)・postgres-clean(5433)のホスト公開は、ホストOS からのデバッグ用と位置付ける。

backend の 8000 は**ファイアウォールで送信元を GW 機に限定する**。`/api/chat/*` は認証なしで vllm を呼ぶ経路であり(要件§5.2)、8000 が学内に開いていると誰でも DGX Spark の GPU を回せてしまう。DGX Spark の GPU は本プロジェクト以外のワークロードとも共有しているため、濫用の影響は本サービスに留まらない。vllm(8001)を `127.0.0.1` バインドとしていても、backend が代理で呼ぶ以上 8000 を開ければ同じことになる。

限定は DGX Spark のホスト側ファイアウォールで行い、`DOCKER-USER` チェーンに記述する(理由と注意点は§3.5.3と同じ)。DGX Spark 自身から出た通信はこのチェーンを通らないため制限を受けず、ホスト上での動作確認は従来どおり行える。

GW 機側で外部に開けるのは gateway の 80 / 443 のみとする。frontend(3000)はホスト公開せず、gateway からコンテナネットワーク経由でのみ到達できるようにする。

公開入口は GW 機のゲートウェイに限定する。学外(自宅等)からのアクセスも RINS へのファイアウォール制限解除申請により許可する。一方、学生データの処理は DGX 上で完結させ学外クラウドへ送信しない(要件§3.1)。

### 3.5 アクセス制御

学生からのアクセスは、アドバイザー教員研究室に設置する GW 機上のリバースプロキシ(ゲートウェイ)を唯一の入口とする。学外(自宅等)からのアクセスも許可し、その公開は RINS へのファイアウォール制限解除申請により行う(§3.5.2)。データ処理の学外非送信は別途維持する(要件§3.1)。

#### 3.5.1 GW 機の役割

- nginx を構築し、HTTPS を終端する。`/` を同一ホスト上の frontend、`/api/*` を DGX Spark の backend へリバースプロキシする(§1.2)。
- SSE(ストリーミング)を中継できるよう、該当パスではバッファリングを無効化する(`proxy_buffering off` 等)。
- リクエスト/レスポンスのボディはログに記録しない(要件§5.5。詳細は§9)。
- frontend(Next.js)を同居させる。GW 機が担うのは公開入口と画面配信までであり、履修提案ロジック・LLM 推論・シラバス参照はすべて DGX Spark 側で行う。

#### 3.5.2 通信経路と必要な設定・申請

| 通信 | 方向 | 必須/要確認 | 対応 |
|---|---|---|---|
| 学生ブラウザ(学外含む) → GW 機(80/443) | インバウンド | **必須** | RINS へ **ファイアウォール制限解除申請**。申請はアドバイザー教員が代行する。443 用サーバ証明書と、内向け・外向け DNS への登録が前提。RINS には Web 公開用の専用申請区分(Web サーバ外部公開申請)も存在するため、本件がどちらに該当するかは要確認(§13) |
| GW 機 → DGX Spark(backend 8000) | 学内 | **要確認** | 同一セグメントであれば申請不要。セグメントをまたぐ場合のみ RINS に相談する。8000 は非標準ポートのため要注意 |
| GW 機 → DGX Spark を DGX 側で受ける | インバウンド | 申請不要 | DGX のファイアウォールで送信元を GW 機に限定して許可(自分たちで設定。§3.4) |
| GW 機のコンテナ → 上記以外の宛先 | アウトバウンド | 申請不要 | GW 機のファイアウォールで遮断する(§3.5.3) |
| 管理者 → GW 機(SSH 22) | インバウンド | 申請しない | 学内からのみ到達可能とし、学外には開けない |

補足: 「ファイアウォール制限解除申請」は主に**外部→内部**の通信を対象とする(内→外は原則許可済み)。本構成で外部→内部に当たるのは「学生ブラウザ → GW 機(80/443)」のみである。

#### 3.5.3 運用上の前提

- GW 機は RINS が提供する基盤ではなく研究室に自前で設置するサーバであるため、**OS 更新・脆弱性対応・稼働監視の責任は開発チーム側にある**。実務の構築・保守担当は **y240152** が担う。
- GW 機の公開ホスト名と DNS 登録は未確定(§13)。
- **管理(初期構築・nginx 設定・保守)は SSH** で行う。アカウントは学籍番号、認証は公開鍵とし、メンバー全員の鍵登録が済んだ時点でパスワード認証を無効化する。SSH は運用者側の管理経路であり、**学生がサービスを利用するのに SSH は不要**(学生はブラウザから HTTPS でアクセスするのみ)。
- 外部公開ホストとなるため、インバウンドは 443(および証明書取得に必要な範囲で 80)のみを許可し、他は遮断する。OS の自動セキュリティ更新を有効にする。
- **本プロジェクトのコンテナからの外向き通信(egress)は、DGX Spark の backend(8000)のみを許可し、他は遮断する**。GW 機は学外に公開する唯一のホストであり、gateway / frontend が侵害された場合に GW 機上の他の環境や研究室 LAN への足がかりとなることを防ぐ。

egress の遮断は本プロジェクトのコンテナに対するものであり、ホスト自身の通信(OS 更新、証明書取得、コンテナイメージの取得)や GW 機の他の用途は対象としない。この制限は docker compose では表現できず、ホスト側のファイアウォールに記述する。なお、Docker が扱う通信はホスト宛てではなく転送として処理されるため ufw の設定が効かない。Docker が管理者用に空けている `DOCKER-USER` チェーンに記述し、再起動後も残るよう永続化する。宛先は名前解決を要しない IP 指定とし、DNS の外向きを許可しなくて済むようにする。
- 龍谷祭期間を含む常時稼働が前提となるため、設置場所の電源と有線 LAN を確保する。
- 学外公開には DNS 登録(内向け・外向け)とサーバ証明書が前提となる。GW 機↔DGX Spark 間の疎通可否と、申請区分・開放ポートの詳細は RINS 担当教員に確認のうえ確定する(§13)。

#### 3.5.4 申請の段取りと確定状況

RINS への申請は**外部公開のためのファイアウォール制限解除申請1件**であり、アドバイザー教員が代行する。

**段取り**: GW 機を構築し、学内から gateway → frontend / backend の疎通と SSE 中継を確認 → 公開ホスト名の確定 → DNS 登録 → 証明書取得 → ファイアウォール制限解除申請 → 外部公開。申請以外の工程は申請の可否を待たずに進められる。

**申請(確定値)**

| 項目 | 内容 |
|---|---|
| 対象ホスト | GW 機(アドバイザー教員研究室に設置) |
| 開放ポート | 443/tcp(必須)、80/tcp(Let's Encrypt の HTTP-01 認証および HTTPS へのリダイレクトに使用。可否は要確認) |
| 利用目的 | 履修登録支援AIチャットボットの公開ゲートウェイ(nginx リバースプロキシ + 画面配信)。履修提案ロジックと LLM は DGX Spark 側 |
| 公開範囲 | 学外を含む(在学生が自宅からも利用するため) |
| 実務管理担当 | y240152(SSH で構築・保守) |
| 申請時の空欄 | 申請責任単位、責任者(=アドバイザー教員)の氏名・メール(先生側情報) |

**公開フェーズで確定する項目**

| 項目 | 内容 |
|---|---|
| 証明書 | **Let's Encrypt** を採用(無料・自動更新)。ドメイン認証方式(HTTP-01 / DNS-01)は DNS・ポートの段取り次第で決定 |
| 前提 | 公開ホスト名の確定、内向け・外向け DNS 登録 |
| ホスト名 | 公開フェーズで確定(後変更も可だが DNS・証明書・申請・告知物に波及するため公開前に確定が望ましい) |
