import type { Metadata } from "next";
import { Noto_Sans_JP, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import BottomTabBar from "@/components/BottomTabBar";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html lang="ja" className={`${notoSansJP.variable} ${ibmPlexMono.variable}`}>
      <body className="min-h-screen flex flex-col font-sans bg-[#F8F9FA]">
        {/* デスクトップ用ヘッダー */}
        <div className="hidden md:block">
          <Header />
        </div>
        <main className="flex-1 flex flex-col pb-[76px] md:pb-0">{children}</main>
        {/* モバイル用ボトムタブ */}
        <div className="md:hidden">
          <BottomTabBar />
        </div>
      </body>
    </html>
  );
}
