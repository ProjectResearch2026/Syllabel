"use client";

import { Lock, WifiOff, Trash2 } from "lucide-react";
import { motion } from "motion/react";

type Props = {
  onAccept: () => void;
  onCancel: () => void;
};

export default function PrivacyConsentModal({ onAccept, onCancel }: Props) {
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
          <a href="/privacy" target="_blank" rel="noopener" className="underline">
            プライバシーポリシー
          </a>
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
