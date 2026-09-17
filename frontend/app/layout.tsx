import type { Metadata } from "next";
import {
  Noto_Sans_JP,
  IBM_Plex_Mono,
  Funnel_Sans,
  Inter,
  Geist,
} from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import BottomTabBar from "@/components/BottomTabBar";
import AiLayer from "@/components/ai/AiLayer";

/*
 * ui-design_phone.pen が使う4書体をそのまま読み込む。
 * Funnel Sans / Inter / Geist は日本語グリフを持たないため、
 * globals.css のフォントスタックで Noto Sans JP を後ろに繋いでいる
 * （ラテン文字は設計通りの書体、日本語は Noto にフォールバックする）。
 */
const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const funnelSans = Funnel_Sans({
  variable: "--font-funnel-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "履修登録支援AIチャットボット",
  description: "龍谷大学 知能情報メディア課程 履修登録支援システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${notoSansJP.variable} ${funnelSans.variable} ${inter.variable} ${geist.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen flex flex-col font-ui bg-surface-gray">
        {/* デスクトップ用ヘッダー */}
        <div className="hidden md:block">
          <Header />
        </div>
        {/*
          pb はタブバー（80px）の高さ分。Ask Bar のある画面は各ページで追加する。
          PC では ui-design_pc.pen の PageBody に合わせ、左右 16px・下 8px の
          余白を本文の外側に持たせる（カードがグレーの地に浮く）。
        */}
        <main className="flex min-h-0 flex-1 flex-col pb-20 md:px-4 md:pb-2">
          {children}
        </main>
        {/* モバイル用ボトムタブ（AI導線マップに従い 時間割 / シラバス / マイデータ の3つ） */}
        <div className="md:hidden">
          <BottomTabBar />
        </div>
        {/*
          AIアシスタント。ページではなく全画面共通のオーバーレイとして置く。
          「別ページへ移動した」感を出さないための設計意図（★ AI導線マップ）。
        */}
        <div className="md:hidden">
          <AiLayer />
        </div>
      </body>
    </html>
  );
}
