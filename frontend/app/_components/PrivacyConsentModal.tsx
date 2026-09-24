"use client";

import Link from "next/link";
import { CloudOff, ExternalLink, Lock, Monitor, ShieldCheck, WifiOff, Trash2 } from "lucide-react";
import { motion } from "motion/react";

type Props = {
  onAccept: () => void;
  onCancel: () => void;
  /** モバイル（ui-design_phone.pen 01-2_Import_同意モーダル）。項目の説明文を畳んだ短い形 */
  compact?: boolean;
};

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
            PDFを取り込む前に、データの取り扱い方針をご確認ください。
          </p>
        </div>

        <div className="bg-[#F8F9FA] rounded-xl p-4 flex flex-col gap-3">
          {[
            {
              icon: Lock,
              title: "ブラウザ上のみで処理",
              desc: "PDFファイルはサーバーへ送信されません。テキスト抽出はすべてブラウザ内で完結します。",
            },
            {
              icon: WifiOff,
              title: "外部AIサービスへの送信なし",
              desc: "成績情報は学内サーバーのAIのみが参照し、外部のクラウドサービスには送信しません。",
            },
            {
              icon: Trash2,
              title: "ページを閉じると即時消去",
              desc: "取り込んだデータはブラウザのメモリにのみ保持され、リロード・タブクローズで完全に消えます。",
            },
          ].map(({ icon: Icon, title, desc }, i) => (
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
  const items = [
    { icon: Monitor, title: "ブラウザ上のみで処理" },
    { icon: CloudOff, title: "外部AIサービスへの送信なし" },
    { icon: Trash2, title: "ページを閉じると即時消去" },
  ];
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

        {items.map(({ icon: Icon, title }) => (
          <div key={title} className="flex items-center gap-2.5 rounded-lg bg-surface-gray px-3 py-2.5">
            <Icon size={16} className="shrink-0 text-fg-primary" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-fg-primary">{title}</span>
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
