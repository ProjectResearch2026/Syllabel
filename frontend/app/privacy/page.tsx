import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  CloudOff,
  ShieldCheck,
  FileText,
  Cpu,
  Server,
  History,
  ArrowRight,
  Monitor,
  WifiOff,
  Database,
  Send,
  Fingerprint,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

/**
 * プライバシーとデータの取り扱い（ui-design_pc.pen 07_プライバシー）。要件§5.6・設計§9。
 *
 * **実際のデータの流れ**を先に見せ、そのあとにデータの扱いを並べる。文章より経路の図のほうが早い。
 *
 * **記録が残る事実を、残る範囲とともに書く。** AI に送った内容とシラバスの検索条件は学内の
 * トークンゲートウェイに100日間記録される（要件§5.2・§5.5）。「消去される」「痕跡は残らない」とは書かない。
 * 100日後に消えるかは確認できていないため、消えるとも書かない。
 */

const LEAD =
  "あなたの成績データは学外に送信されず、ブラウザと学内のサーバーの中だけで処理されます。ただし、AIに送った内容とシラバスの検索条件は学内のサーバーに100日間記録されます。以下は実際のデータの流れです。";

const FLOW: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: FileText, title: "成績PDFを選択", sub: "あなたの端末" },
  { icon: Cpu, title: "ブラウザ内で解析", sub: "PDFは端末から出ない" },
  { icon: Server, title: "学内のAIで提案・回答", sub: "履修状況を学内へ送る" },
  { icon: History, title: "送った内容を記録", sub: "学内のサーバーに100日間" },
];

const PRINCIPLES: { icon: LucideIcon; mobileIcon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Monitor,
    mobileIcon: Monitor,
    title: "成績表はブラウザで読み取る",
    body: "成績PDFの解析は端末内のPDF.jsで完結し、ファイルがサーバーへ届くことはありません。取り込んだ内容はブラウザのメモリにだけあり、リロードやタブを閉じると消えます。",
  },
  {
    icon: WifiOff,
    mobileIcon: CloudOff,
    title: "学外のAIには送らない",
    body: "ChatGPT等の学外のAIサービスは使わず、学内のローカルLLMだけで回答します。",
  },
  {
    icon: Send,
    mobileIcon: Send,
    title: "AIに送るもの・送らないもの",
    body: "時間割の提案とAIへの質問のときに、課程・入学年度・学年・修得済みと未修得の科目名・単位数・卒業要件ごとの不足単位・今の時間割・あなたが入力した文章を送ります。氏名・学籍番号・成績の評価・GPAは送りません。",
  },
  {
    icon: History,
    mobileIcon: History,
    title: "送った内容は100日間記録される",
    body: "AIとシラバスへの中継を担う学内のサーバーが、AIに送った内容とAIの回答、シラバスの検索条件(教員名・曜日・講義内容の語など)と検索結果を100日間記録します。シラバスの検索条件に成績は含まれません。",
  },
  {
    icon: Database,
    mobileIcon: Database,
    title: "このサービスのサーバーには保存しない",
    body: "このサービスのサーバーはデータベースに保存せず、成績の内容をログにも記録しません。",
  },
  {
    icon: Fingerprint,
    mobileIcon: Fingerprint,
    title: "個人が推定される可能性",
    body: "氏名や学籍番号は送りませんが、課程・学年と修得済み・未修得の科目の組み合わせから、個人が推定される可能性があります。",
  },
];

/** 学生データの経路とは別の学外通信。書影は端末から直接取得する（設計§6.4） */
const BOOK_NOTE =
  "講義詳細の本の表紙画像は、ブラウザが学外の書誌サービス(openBD)から直接取得します。送るのはISBNだけで、成績や閲覧中の講義は送りません。";

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
 * データの扱いは1列のカードにする。
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
          {LEAD}
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

        <h2 className="w-full text-base font-bold text-fg-primary">データの扱い</h2>
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

        <p className="flex w-full items-start gap-2 text-[11px] leading-[1.6] text-fg-secondary">
          <BookOpen size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {BOOK_NOTE}
        </p>

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
          {LEAD}
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
      <h2 className="w-full max-w-[820px] text-base font-bold text-fg-primary">データの扱い</h2>
      <div className="grid w-full max-w-[820px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <p className="flex w-full max-w-[820px] items-start gap-2 text-xs leading-5 text-fg-secondary">
        <BookOpen size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {BOOK_NOTE}
      </p>

      <p className="text-xs text-fg-faint">龍谷大学 プロジェクトリサーチ 2026</p>
    </div>
  );
}
