# Syllabel frontend

履修登録支援AIチャットボット「Syllabel」の画面。Next.js(App Router)+ TypeScript + Tailwind CSS で作っている。全体の説明はリポジトリ直下の [README](../README.md)、仕様は [設計書](../docs/design.md)(画面とルートは §8、frontend の内部は §4.1)にある。

## 画面

PC とモバイルで同じ URL に同じ役割の画面を置き、レイアウトだけを画面幅で切り替える。

| パス | 画面 |
|---|---|
| `/` | 成績表 PDF の取り込み(デモの学生の読み込みもここ) |
| `/proposal` | 時間割の提案と AI との会話 |
| `/syllabus` | シラバスの検索。その学生にとっての区分・履修区分・修得済みをタグで出す |
| `/syllabus/[code]` | 講義の詳細と、その講義についての AI との会話 |
| `/mydata` | 取り込んだ学生情報の確認・訂正・リセット |
| `/privacy` | プライバシーポリシー |

## プライバシー

- 成績表 PDF はブラウザの中で読み取り(`pdfjs-dist`)、ファイルをサーバへ送らない
- 学生情報と会話は Zustand の store にだけ置き、永続化しない。リロードやタブを閉じると消える
- 通信先は backend(`/syllabel/api/*`)と、講義詳細の書影を引く学外の openBD(ISBN だけを送る)の2つだけ

## 開発

```bash
npm install
npm run dev        # http://localhost:3000/syllabel
npm run lint
npm run build      # .next/standalone に出力する(コンテナ用)
```

公開 URL が `/syllabel` 配下のため、`basePath` を `/syllabel` にしている。`basePath` は `fetch()` のパスには付かないので、backend の宛先は `lib/api_base.ts` の `apiBase()` で決める。

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `BACKEND_ORIGIN` | 開発時 `http://localhost:8000` / 本番 `http://syllabel-backend:8000` | サーバ側描画から引く backend のオリジン |

開発時はゲートウェイが無いため、ブラウザからの `/syllabel/api/*` は `next.config.ts` の `rewrites()` が `BACKEND_ORIGIN` へ中継する。backend とシラバスバックエンドを手元で立てる手順は、リポジトリ直下の README の「ローカル開発環境」にある。公開中の backend を宛先にすれば frontend だけで開発できる。

```bash
BACKEND_ORIGIN="https://<公開ホスト>/syllabel" npm run dev
```

## 成績表の読み取りの確認

ブラウザを使わずに、手元の成績表 PDF で読み取り結果を確かめられる。PDF と出力には個人情報が含まれるので、リポジトリに置かない。

```bash
node scripts/parse_grade_report_local.mjs <成績表.pdf>     # 読み取り結果を表示する
node scripts/dump_grade_report.mjs <成績表.pdf> [出力.tsv]  # PDF のテキストをそのまま書き出す
```

## コンテナ

`Containerfile` でビルドし、公開 VM の rootless Podman で動かす(設計書 §3.2.1)。

```bash
podman build -t localhost/syllabel-frontend:latest .
```

実装上の決まり(状態管理・API の呼び方・タグの判定など)は [AGENTS.md](AGENTS.md) にまとめている。
