import type { Metadata } from "next";
import { IBM_Plex_Sans_JP } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import BottomTabBar from "@/components/BottomTabBar";
import AiLayer from "@/components/ai/AiLayer";
import { CreditSummaryProvider } from "@/lib/creditSummary";

/*
 * 全書体を IBM Plex Sans JP に統一する。
 * 欧文・和文を同じスーパーファミリーで揃えるため、
 * globals.css のフォントスタック（ui / display / cell / sans）は
 * すべてこの1書体を参照する。単位数・時限などの数値は等幅書体では
 * なく tabular-nums（等幅数字）で桁を揃える。
 */
const ibmPlexSansJP = IBM_Plex_Sans_JP({
  variable: "--font-ibm-plex-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={ibmPlexSansJP.variable}
    >
      <body className="min-h-screen flex flex-col font-ui bg-surface-gray">
        {/*
          単位の集計と卒業要件の判定。ヘッダーの単位数と履修提案の帯が同じ値を見るため、
          ここで1回だけ引く(lib/creditSummary.tsx)
        */}
        <CreditSummaryProvider>
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
        </CreditSummaryProvider>
      </body>
    </html>
  );
}
