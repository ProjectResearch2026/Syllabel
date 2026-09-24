import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  CloudOff,
  ShieldCheck,
  FileText,
  Cpu,
  Server,
  Trash2,
  ArrowRight,
  Monitor,
  WifiOff,
  Database,
  EyeOff,
  type LucideIcon,
} from "lucide-react";

/**
 * プライバシーとデータの取り扱い（ui-design_pc.pen 07_プライバシー）。
 *
 * 要件§5 / 設計§9 の「学生のデータをサーバに残さない」を、**実際のデータの流れ**
 * として先に見せ、そのあとに4つの約束を置く。文章より経路の図のほうが早い。
 */

const FLOW: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: FileText, title: "成績PDFを選択", sub: "あなたの端末" },
  { icon: Cpu, title: "ブラウザ内で解析", sub: "PDF.js・端末内" },
  { icon: Server, title: "学内サーバーで提案", sub: "DGX・学内のみ" },
  { icon: Trash2, title: "閉じると消去", sub: "痕跡は残らない" },
];

const PRINCIPLES: { icon: LucideIcon; mobileIcon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Monitor,
    mobileIcon: Monitor,
    title: "ブラウザ上でのみ処理",
    body: "成績PDFの解析は端末内のPDF.jsで完結。ファイルがサーバーへ届くことはありません。",
  },
  {
    icon: WifiOff,
    mobileIcon: CloudOff,
    title: "外部AIに送信しない",
    body: "ChatGPT等の外部サービスは一切利用せず、学内のローカルLLMだけで回答します。",
  },
  {
    icon: Database,
    mobileIcon: Database,
    title: "永続保存しない",
    body: "サーバーにデータベース保存は行いません。処理後はメモリから即時破棄されます。",
  },
  {
    icon: EyeOff,
    mobileIcon: EyeOff,
    title: "ログに残さない",
    body: "成績内容をアクセスログにも記録しません。閉じれば痕跡は残りません。",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <div className="flex flex-1 flex-col md:hidden">
        <MobilePrivacy />
      </div>
      <div className="hidden flex-1 flex-col md:flex">
        <PcPrivacy />
      </div>
    </>
  );
}

/**
 * モバイル（ui-design_phone.pen 07_プライバシー）。流れの図は縦に積み、
 * 4つの約束は1列のカードにする。
 *
 * 戻り先は行き先を決め打ちにする（`/mydata`）。`router.back()` だと、取り込みの
 * 確認ウィンドウから別タブで開いたときに戻る先が無い。
 */
function MobilePrivacy() {
  return (
    <div className="flex flex-1 flex-col bg-surface-gray">
      <div className="sticky top-0 z-20 flex h-12 items-center border-b border-border-primary bg-surface-primary px-4">
        <Link href="/mydata" className="flex items-center gap-1.5">
          <ChevronLeft size={18} className="text-fg-primary" aria-hidden="true" />
          <span className="text-[13px] font-semibold text-fg-primary">戻る</span>
        </Link>
      </div>

      <div className="flex flex-col items-center gap-5 px-4 py-6">
        <span className="grid size-16 place-items-center rounded-full bg-surface-soft">
          <ShieldCheck size={32} className="text-fg-primary" aria-hidden="true" />
        </span>
        <h1 className="w-full text-center text-[22px] font-bold text-fg-primary">
          プライバシーとデータの取り扱い
        </h1>
        <p className="w-full text-center text-[13px] leading-[1.7] text-fg-secondary">
          あなたの成績データは学外に送信されず、ブラウザと学内サーバーの中だけで処理されます。以下は実際のデータの流れです。
        </p>

        <div className="flex w-full flex-col items-center">
          {FLOW.map((step, i) => (
            <div key={step.title} className="flex w-full flex-col items-center">
              <div className="flex w-full items-center gap-3 rounded-lg border border-border-primary bg-surface-primary px-3.5 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-soft">
                  <step.icon size={16} className="text-fg-primary" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-px">
                  <span className="text-[13px] font-bold text-fg-primary">{step.title}</span>
                  <span className="text-[11px] text-fg-secondary">{step.sub}</span>
                </span>
              </div>
              {i < FLOW.length - 1 && (
                <ChevronDown size={16} className="text-fg-faint" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        <h2 className="w-full text-base font-bold text-fg-primary">4つの約束</h2>
        {PRINCIPLES.map((p) => (
          <div
            key={p.title}
            className="flex w-full flex-col gap-1.5 rounded-lg border border-border-primary bg-surface-primary p-3.5"
          >
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg-primary">
              <p.mobileIcon size={18} className="shrink-0" aria-hidden="true" />
              {p.title}
            </h3>
            <p className="text-xs leading-[1.6] text-fg-secondary">{p.body}</p>
          </div>
        ))}

        <p className="w-full text-[11px] text-fg-faint">龍谷大学 プロジェクトリサーチ 2026</p>
      </div>
    </div>
  );
}

function PcPrivacy() {
  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-4 py-10 md:px-16">
      {/* Hero */}
      <div className="flex w-full max-w-[820px] flex-col items-center gap-3">
        <span className="grid size-16 place-items-center rounded-full bg-surface-soft">
          <ShieldCheck size={32} className="text-fg-primary" aria-hidden="true" />
        </span>
        <h1 className="text-center text-[26px] font-bold text-fg-primary">
          プライバシーとデータの取り扱い
        </h1>
        <p className="max-w-[560px] text-center text-sm leading-6 text-fg-secondary">
          あなたの成績データは学外に送信されず、ブラウザと学内サーバーの中だけで処理されます。以下は実際のデータの流れです。
        </p>
      </div>

      {/* Data flow */}
      <div className="flex w-full max-w-[820px] flex-col items-stretch md:flex-row md:items-center">
        {FLOW.map((step, i) => (
          <div
            key={step.title}
            className="flex flex-col items-stretch md:flex-1 md:flex-row md:items-center"
          >
            <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-border-primary bg-surface-primary p-4 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-accent-light">
                <step.icon size={20} className="text-accent" aria-hidden="true" />
              </span>
              <p className="text-[13px] font-bold text-fg-primary">{step.title}</p>
              <p className="text-[11px] text-fg-secondary">{step.sub}</p>
            </div>
            {i < FLOW.length - 1 && (
              <ArrowRight
                size={20}
                aria-hidden="true"
                className="w-10 shrink-0 rotate-90 self-center text-fg-faint md:rotate-0"
              />
            )}
          </div>
        ))}
      </div>

      {/* Principles */}
      <h2 className="w-full max-w-[820px] text-base font-bold text-fg-primary">4つの約束</h2>
      <div className="grid w-full max-w-[820px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PRINCIPLES.map((p) => (
          <div
            key={p.title}
            className="flex flex-col gap-2.5 rounded-lg border border-border-primary bg-surface-primary p-6"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-surface-soft">
              <p.icon size={18} className="text-fg-primary" aria-hidden="true" />
            </span>
            <h3 className="text-sm font-bold text-fg-primary">{p.title}</h3>
            <p className="text-xs leading-5 text-fg-secondary">{p.body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-fg-faint">龍谷大学 プロジェクトリサーチ 2026</p>
    </div>
  );
}
