"use client";

import Link from "next/link";
import { ExternalLink, History, Lock, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";

type Props = {
  onAccept: () => void;
  onCancel: () => void;
  /** モバイル（ui-design_phone.pen 01-2_Import_同意モーダル）。項目の説明文を畳んだ短い形 */
  compact?: boolean;
};

/**
 * 確認ウィンドウに並べる3項目（要件§5.6）。PC は説明文まで、モバイルは短い説明文まで出す。
 *
 * **記録が残る事実を、残る範囲とともに書く。** 「消去される」「どこにも残らない」とは
 * 書かない — AI に送った内容は学内のトークンゲートウェイに100日間記録される（要件§5.2・§5.5）。
 */
const ITEMS: { icon: LucideIcon; title: string; desc: string; short: string }[] = [
  {
    icon: Lock,
    title: "成績表はブラウザの中で読み取ります",
    desc: "PDFファイルはサーバーへ送られず、このサービスのサーバーに保存されることもありません。取り込んだ内容はブラウザのメモリにだけあり、リロードやタブを閉じると消えます。",
    short: "PDFはサーバーへ送らず、このサービスのサーバーにも保存しません。",
  },
  {
    icon: Send,
    title: "AIが提案を作るとき、履修状況を学内のAIサーバーに送ります",
    desc: "課程・学年・修得済みと未修得の科目名・単位数・不足単位を送ります。氏名・学籍番号・成績の評価・GPAは送りません。学外のAIサービスには送りません。",
    short: "科目名・単位数・不足単位など。氏名・学籍番号・成績の評価は送りません。",
  },
  {
    icon: History,
    title: "送った内容と回答は100日間記録されます",
    desc: "学内のAIサーバーの運用のため、送った内容とAIの回答が100日間記録されます。科目の組み合わせから個人が推定される可能性があります。",
    short: "学内での運用のための記録です。科目の組み合わせから個人が推定され得ます。",
  },
];

/**
 * 成績表を取り込む前の確認ウィンドウ（要件§5.6）。PC・モバイルとも、PDF を選んだあと
 * 解析を始める前に出す。
 *
 * プライバシーポリシーへのリンクは `next/link` で張る。素の `<a href="/privacy">` には
 * basePath（/syllabel）が付かず、公開環境では配信サーバのルートへ飛んでいた。
 */
export default function PrivacyConsentModal({ onAccept, onCancel, compact = false }: Props) {
  if (compact) return <CompactConsentModal onAccept={onAccept} onCancel={onCancel} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* スクリム */}
      <motion.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />

      {/* モーダル本体 */}
      <motion.div
        className="relative w-[448px] bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-5"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 360, mass: 0.7 }}
      >
        <div>
          <h2 className="text-[#1A2B4E] text-lg font-bold mb-1">
            成績表の取り扱いについて
          </h2>
          <p className="text-[#6B7280] text-sm leading-relaxed">
            PDFを取り込む前に、データの取り扱いをご確認ください。
          </p>
        </div>

        <div className="bg-[#F8F9FA] rounded-xl p-4 flex flex-col gap-3">
          {ITEMS.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              className="flex items-start gap-3"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, delay: 0.1 + i * 0.06 }}
            >
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-[#EEF1F8] flex items-center justify-center">
                <Icon size={14} className="text-[#1A2B4E]" />
              </div>
              <div>
                <p className="text-[#1A2B4E] text-sm font-semibold">{title}</p>
                <p className="text-[#6B7280] text-xs leading-relaxed mt-0.5">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-[#9CA3AF] text-xs text-center leading-relaxed">
          詳細は
          <Link href="/privacy" target="_blank" rel="noopener" className="underline">
            プライバシーポリシー
          </Link>
          をご確認ください。学籍番号はPDFから取得しません。
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onAccept}
            className="w-full h-11 rounded-lg bg-[#1A2B4E] text-white text-sm font-semibold hover:bg-[#0f1d36] transition-colors"
          >
            同意して取り込む
          </button>
          <button
            onClick={onCancel}
            className="w-full h-11 rounded-lg border border-[#D1D5DB] text-[#6B7280] text-sm hover:bg-[#F9FAFB] transition-colors"
          >
            キャンセル
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CompactConsentModal({ onAccept, onCancel }: Omit<Props, "compact">) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <motion.div
        className="absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onCancel}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="relative flex w-full max-w-[350px] flex-col gap-3.5 rounded-xl bg-surface-primary p-5"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 360, mass: 0.7 }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} className="shrink-0 text-accent" aria-hidden="true" />
          <h2 id="consent-title" className="text-[17px] font-bold text-fg-primary">
            成績表の取り扱いについて
          </h2>
        </div>

        {ITEMS.map(({ icon: Icon, title, short }) => (
          <div key={title} className="flex items-start gap-2.5 rounded-lg bg-surface-gray px-3 py-2.5">
            <Icon size={16} className="mt-0.5 shrink-0 text-fg-primary" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold leading-snug text-fg-primary">{title}</span>
              <span className="text-[11px] leading-snug text-fg-secondary">{short}</span>
            </span>
          </div>
        ))}

        <Link
          href="/privacy"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 self-start text-xs text-accent"
        >
          プライバシーポリシー
          <ExternalLink size={12} aria-hidden="true" />
        </Link>
        <p className="text-[11px] text-fg-secondary">学籍番号はPDFから取得しません。</p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="h-11 rounded bg-accent text-sm font-semibold text-fg-inverse transition-colors active:bg-primary-dark"
          >
            同意して取り込む
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded border-[1.5px] border-fg-primary bg-surface-primary text-sm font-semibold text-fg-primary transition-colors active:bg-surface-gray"
          >
            キャンセル
          </button>
        </div>
      </motion.div>
    </div>
  );
}
