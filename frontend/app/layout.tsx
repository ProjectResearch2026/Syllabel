import type { Metadata } from "next";
import { IBM_Plex_Sans_JP } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import BottomDock from "@/components/BottomDock";
import { CreditSummaryProvider } from "@/lib/creditSummary";
import MotionProvider from "@/components/MotionProvider";
import ReplaceBanner from "@/components/ReplaceBanner";

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
        {/* 動きを減らす設定の端末では motion の動きを止める(components/MotionProvider.tsx) */}
        <MotionProvider>
        <CreditSummaryProvider>
          {/* デスクトップ用ヘッダー */}
          <div className="hidden md:block">
            <Header />
          </div>
          {/*
            PC では ui-design_pc.pen の PageBody に合わせ、左右 16px・下 8px の
            余白を本文の外側に持たせる（カードがグレーの地に浮く）。
            モバイルの下の余白はボトムドックが自分の高さぶん持つ。
          */}
          <main className="flex min-h-0 flex-1 flex-col md:px-4 md:pb-2">
            {/* 時間割の科目を「別の科目に変更する」途中の帯(シラバスの画面だけに出る。PC は下に浮かせ、高さの決まった画面を押し下げない) */}
            <ReplaceBanner />
            {children}
          </main>
          {/*
            モバイル用ボトムドック（Ask Bar ＋ 時間割 / シラバス / マイデータ）。
            AIアシスタントのシートは各画面が `MobileAiAssistant` で持ち、ページではなく
            同一画面上のオーバーレイとして開く（★ AI導線マップ）。
          */}
          <BottomDock />
        </CreditSummaryProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
