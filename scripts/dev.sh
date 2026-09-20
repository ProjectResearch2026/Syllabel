#!/usr/bin/env bash
# ローカル開発スタックの起動。backend(FastAPI)と frontend(Next.js)を
# ホットリロード付きで同時に立ち上げる。README「ローカル開発環境」参照。
#
#   scripts/dev.sh
#
# vllm は立てない。チャットと履修提案は使えないが、シラバス検索・詳細・
# 履修要項のタグ表示はすべて動く。
#
# 前提: シラバスバックエンド(api-clean)が http://localhost:5050 で動いていること。
# 立て方は README を参照(別リポジトリ ProjectResearch2026/syllabus_backend の
# bin/init_clean.sh が Postgres ごと用意する)。

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"

API_CLEAN_BASE_URL="${API_CLEAN_BASE_URL:-http://localhost:5050}"
BACKEND_ORIGIN="${BACKEND_ORIGIN:-http://localhost:8000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# ---- preflight -----------------------------------------------------------
if ! curl -fsS --max-time 3 "$API_CLEAN_BASE_URL/healthz" >/dev/null 2>&1; then
  cat >&2 <<EOF
x api-clean に到達できない: $API_CLEAN_BASE_URL

シラバスバックエンドを先に立ててください(初回のみ。docker が要ります):

  git clone https://github.com/ProjectResearch2026/syllabus_backend ../syllabus_backend
  cd ../syllabus_backend && bin/init_clean.sh --years 2026

2回目以降は次で上がります:

  cd ../syllabus_backend && docker compose -f docker-compose.clean.yml up -d

別の宛先を使う場合は API_CLEAN_BASE_URL で指定してください。
EOF
  exit 1
fi

if [[ ! -d "$REPO/backend/.venv" ]]; then
  echo "x backend/.venv がありません。README の手順で作ってください:" >&2
  echo "    cd backend && python -m venv .venv && .venv/bin/pip install -e '.[dev]'" >&2
  exit 1
fi

if [[ ! -d "$REPO/frontend/node_modules" ]]; then
  echo "x frontend/node_modules がありません。cd frontend && npm install を先に。" >&2
  exit 1
fi

# ---- run -----------------------------------------------------------------
pids=()
cleanup() {
  trap - INT TERM EXIT
  [[ ${#pids[@]} -gt 0 ]] && kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "-> backend  http://localhost:$BACKEND_PORT  (api-clean: $API_CLEAN_BASE_URL)"
(
  cd "$REPO/backend"
  API_CLEAN_BASE_URL="$API_CLEAN_BASE_URL" \
    .venv/bin/uvicorn app.main:app --reload --port "$BACKEND_PORT" 2>&1 | sed 's/^/[backend ] /'
) &
pids+=($!)

echo "-> frontend http://localhost:3000/syllabel"
(
  cd "$REPO/frontend"
  BACKEND_ORIGIN="$BACKEND_ORIGIN" npm run dev 2>&1 | sed 's/^/[frontend] /'
) &
pids+=($!)

cat <<EOF

起動中。Ctrl-C で両方止まります。
  画面      : http://localhost:3000/syllabel/syllabus
  backend   : http://localhost:$BACKEND_PORT/api/healthz
  api-clean : $API_CLEAN_BASE_URL/docs

backend・frontend ともソースを保存すると自動で反映されます。
EOF

wait
