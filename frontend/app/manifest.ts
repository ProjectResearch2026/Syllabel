import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/api_base";
import { SERVICE_NAME, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

/**
 * Web アプリマニフェスト。スマホでホーム画面に追加したときの名前とアイコンを決める。
 *
 * これが無いと Android の Chrome は使えるアイコンを見つけられず、灰色の四角に
 * ドメイン名の頭文字を描いたアイコンを自動で作る(SVG のファビコンと 180px の
 * apple-icon.png は使われない)。
 *
 * マニフェストの中の URL には basePath が付かないので、`/syllabel` を自分で含める。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SERVICE_NAME,
    description: SITE_DESCRIPTION,
    id: `${BASE_PATH}/`,
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: `${BASE_PATH}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
