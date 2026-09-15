/**
 * backend の宛先を解決する。design.md §6.1 / §3.5.2。
 *
 * 呼び出し元によって宛先が分かれる。
 *
 * - **ブラウザ(クライアントコンポーネント)**: ゲートウェイと同一オリジンの
 *   `/pr-2026/api/...`(相対パス)。`next.config.ts` の `basePath` はページと
 *   アセットの生成先を変えるだけで `fetch()` のパスには前置されないため、
 *   公開パスを自分で含める。
 * - **サーバ側描画(RSC / `page.tsx` の `async` 関数)**: 同一 Podman ネットワーク上の
 *   backend コンテナを直接引く。ゲートウェイを経由しないため `/pr-2026` は付かない。
 *
 * `lib/syllabus-api.ts` はサーバ側描画とブラウザの双方から import されるため、
 * 宛先はモジュール読み込み時ではなく**呼び出しごとに**解決する。
 */

/** ページの公開パス。`next.config.ts` の `basePath` に渡す値でもある(§3.5.2) */
export const BASE_PATH = "/pr-2026";

/** ブラウザから叩く公開パス。ゲートウェイが `/pr-2026` を剥がして backend へ渡す */
const BROWSER_API_BASE = `${BASE_PATH}/api`;

/** 公開 VM での backend の宛先。Podman ネットワーク `pr2026` の名前解決による(§3.2.1) */
const DEFAULT_BACKEND_ORIGIN = "http://pr2026-backend:8000";

/** 開発時の backend の宛先。`uvicorn app.main:app --reload` の待受(README) */
const DEV_BACKEND_ORIGIN = "http://localhost:8000";

/**
 * サーバ側描画から引く backend のオリジン。
 *
 * `NEXT_PUBLIC_` を付けない変数はクライアントバンドルに埋め込まれず、standalone
 * 実行時に評価される。公開 VM では Quadlet の環境ファイルで与える(§3.2.1)。
 */
export function backendOrigin(): string {
  const configured = process.env.BACKEND_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production"
    ? DEFAULT_BACKEND_ORIGIN
    : DEV_BACKEND_ORIGIN;
}

/** backend の API ベース。末尾にスラッシュは付けない */
export function apiBase(): string {
  if (typeof window !== "undefined") return BROWSER_API_BASE;
  return `${backendOrigin()}/api`;
}
