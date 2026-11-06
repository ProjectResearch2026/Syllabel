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
 *
 * **maskable のアイコンは絵を安全領域(中心から幅の 40% の円)いっぱいまで広げる。**
 * Android はこの画像を丸などに切り抜き、見える範囲は画像の幅の 9 割ほどになる。
 * 以前は絵が中心から 32% までしか届かず、ほかのアプリより小さく見えていた。
 * 描き直すときは `public/logo.svg` から作り、絵の外接円の半径を幅の 0.39 にする。
 * 外接円の中心を画像の中心に合わせると、上の輪が円を広げるぶん絵が上に寄って見えるので、
 * 輪と翼の上下の余白の差を半分に詰める位置まで下げている(半径 0.39 は保つ)。
 * iPhone はマニフェストではなく `app/apple-icon.png` を使い、角丸の四角に切り抜く。
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
