import {
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

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Monitor,
    title: "ブラウザ上でのみ処理",
    body: "成績PDFの解析は端末内のPDF.jsで完結。ファイルがサーバーへ届くことはありません。",
  },
  {
    icon: WifiOff,
    title: "外部AIに送信しない",
    body: "ChatGPT等の外部サービスは一切利用せず、学内のローカルLLMだけで回答します。",
  },
  {
    icon: Database,
    title: "永続保存しない",
    body: "サーバーにデータベース保存は行いません。処理後はメモリから即時破棄されます。",
  },
  {
    icon: EyeOff,
    title: "ログに残さない",
    body: "成績内容をアクセスログにも記録しません。閉じれば痕跡は残りません。",
  },
];

export default function PrivacyPage() {
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
