import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 公開URLが https://…/pr-2026/ のサブパス配信なので、
  // ページ・アセット・next/link の生成先をすべて /pr-2026 配下にずらす
  basePath: "/pr-2026",
  // 実行に必要な最小構成を .next/standalone に出力する（コンテナ用）
  output: "standalone",
};

export default nextConfig;
