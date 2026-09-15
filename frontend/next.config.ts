import type { NextConfig } from "next";
import { BASE_PATH, backendOrigin } from "./lib/api_base";

const nextConfig: NextConfig = {
  // 公開URLが https://…/pr-2026/ のサブパス配信なので、
  // ページ・アセット・next/link の生成先をすべて /pr-2026 配下にずらす
  basePath: BASE_PATH,
  // 実行に必要な最小構成を .next/standalone に出力する（コンテナ用）
  output: "standalone",

  // 開発時はゲートウェイが居ないため、ブラウザからの /pr-2026/api/* が
  // Next の開発サーバに届いて 404 になる。公開経路でゲートウェイが行う
  // 振り分け（設計§3.2.1）と同じことをここで代行する。
  // basePath 使用時 source は basePath 配下として解釈されるため、
  // "/api/:path*" が "/pr-2026/api/:path*" に対応する。
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin()}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
