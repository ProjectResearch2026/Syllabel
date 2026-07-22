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
    <div className="flex-1 bg-[#F8F9FA] px-4 md:px-20 py-12 flex flex-col items-center">
      <div className="w-full max-w-[820px] flex flex-col gap-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-[#EEF0F5] flex items-center justify-center">
            <ShieldCheck size={32} className="text-[#1A2B4E]" />
          </div>
          <h1 className="text-[26px] font-bold text-[#1A2B4E] text-center">
            プライバシーとデータの取り扱い
          </h1>
          <p className="text-sm text-[#4B5563] text-center leading-[1.7] max-w-[560px]">
            あなたの成績データは学外に送信されず、ブラウザと学内サーバーの中だけで処理されます。以下は実際のデータの流れです。
          </p>
        </div>

        {/* Data flow */}
        <div className="flex flex-col md:flex-row md:items-stretch gap-3">
          {FLOW.map((step, i) => (
            <div key={step.title} className="flex flex-col md:flex-row md:flex-1 md:items-center gap-3">
              <div className="flex-1 bg-white rounded-lg border border-[#D1D5DB] p-4 flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-[#FFF0F1] flex items-center justify-center">
                  <step.icon size={20} className="text-[#E60012]" />
                </div>
                <p className="text-[13px] font-bold text-[#1A2B4E]">{step.title}</p>
                <p className="text-[11px] text-[#4B5563]">{step.sub}</p>
              </div>
              {i < FLOW.length - 1 && (
                <ArrowRight size={20} className="text-[#9CA3AF] shrink-0 self-center rotate-90 md:rotate-0" />
              )}
            </div>
          ))}
        </div>

        {/* Principles */}
        <h2 className="text-base font-bold text-[#1A2B4E]">4つの約束</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="bg-white rounded-lg border border-[#D1D5DB] p-5 flex flex-col gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#EEF0F5] flex items-center justify-center">
                <p.icon size={18} className="text-[#1A2B4E]" />
              </div>
              <h3 className="text-sm font-bold text-[#1A2B4E]">{p.title}</h3>
              <p className="text-xs text-[#4B5563] leading-[1.7]">{p.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-2 text-xs text-[#9CA3AF] text-center">
          龍谷大学 プロジェクトリサーチ 2026
        </p>
      </div>
    </div>
  );
}
