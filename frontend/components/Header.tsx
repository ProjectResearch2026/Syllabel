"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import logoMark from "@/public/logo.svg";
import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import AnimatedNumber from "@/components/AnimatedNumber";
import { useStudentStore } from "@/lib/student";
import { useChatStore } from "@/lib/chat";
import { useChatHistoryStore } from "@/lib/chatHistory";
import { useProposalStore } from "@/lib/proposal";
import { useCreditSummary } from "@/lib/creditSummary";
import { useSyllabusUIStore } from "@/lib/syllabusUI";
import { listHref } from "@/lib/syllabusQuery";

/**
 * PC版ヘッダー（ui-design_pc.pen AppHeader）。
 *
 * 地はページ全体と同じグレーで、その上に**白いカードが浮く**。カードの外周
 * 8px/16px の余白はヘッダー自身が持つため、ページ側は `PageBody` の
 * `px-4 pb-2` だけを気にすればよい。
 *
 * 時間割とシラバス一覧では、ヘッダーカードの直下に帯（卒業要件の帯／検索バー）が
 * 続いて**1枚のカードに見える**（下の角丸と余白を落とす）。それ以外の画面では
 * ヘッダーカードが単独で浮く。
 *
 * **取り込みが済むまでナビを出さない。** 成績表を取り込む前は時間割もシラバスの
 * タグ付けも中身が無く、押しても空の画面に着くだけで、取り込みという
 * 唯一やることから注意を逸らす。取り込みが終わった時点（完了画面）から出す。
 *
 * **単位数（取得済み・今期登録・卒業残り）はヘッダーに置く**（design.md §8.3.5）。
 * どの画面からも見え、履修提案の画面では下の帯を卒業要件枠の内訳に空けられる。
 * 値は `lib/creditSummary.tsx` の共有の集計で、ナビと同じく取り込み前は出さない。
 */

const navItems: {
  href: string;
  label: string;
  match: (p: string) => boolean;
}[] = [
    {
      href: "/proposal",
      label: "時間割",
      match: (p) => p.startsWith("/proposal"),
    },
    {
      href: "/syllabus",
      label: "シラバス",
      match: (p) => p.startsWith("/syllabus"),
    },
    {
      href: "/mydata",
      label: "マイデータ",
      match: (p) =>
        p === "/" ||
        p.startsWith("/mydata") ||
        p.startsWith("/privacy"),
    },
  ];

/** 直下に帯が続く画面。ヘッダーカードと帯を地続きに見せる */
function isAttached(pathname: string): boolean {
  return pathname.startsWith("/proposal") || pathname === "/syllabus";
}

/** 取り込みフロー。PC・モバイルとも `/`（`app/page.tsx`） */
function isImportFlow(pathname: string): boolean {
  return pathname === "/";
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useStudentStore((s) => s.profile);
  const clearProfile = useStudentStore((s) => s.clearProfile);
  const clearAll = useChatStore((s) => s.clearAll);
  const clearHistory = useChatHistoryStore((s) => s.clearAll);
  // 生成済みの提案と、学生が書いた希望条件もここで消す（要件§4.8、§5.2.3）
  const clearProposal = useProposalStore((s) => s.clear);
  const resetSyllabusUI = useSyllabusUIStore((s) => s.reset);
  // シラバスへは最後の検索条件を付けて戻る(§8)
  const listQuery = useSyllabusUIStore((s) => s.listQuery);
  const attached = isAttached(pathname);
  const showNav = !(isImportFlow(pathname) && !profile);
  const { completedCredits, currentCredits, remainingCredits } = useCreditSummary();
  const credits = [
    { val: completedCredits, label: "取得済み", color: "text-fg-primary" },
    { val: currentCredits, label: "今期登録", color: "text-accent" },
    { val: remainingCredits, label: "卒業残り", color: "text-[#5F6B7A]" },
  ];

  /*
   * 消してからトップ(取り込み画面)へ戻す。
   *
   * **遷移は `router` で行う。** 以前は `window.location.href = "/"` だったが、
   * 素のブラウザ遷移には `basePath` が付かないため、アプリのトップではなく
   * 配信サーバのルートへ飛んでいた(公開環境では別サービスの画面が出る)。
   * `router.push()` なら basePath が付き、公開パスが変わっても追従する。
   * マイデータ側のリセット(`PcMyDataPage` / `MobileSettingsPage`)と同じ形である。
   */
  const handleReset = () => {
    if (confirm("入力データと対話履歴をすべて消去しますか?")) {
      clearProfile();
      clearAll();
      clearHistory();
      clearProposal();
      resetSyllabusUI();
      router.push("/");
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 h-[68px] shrink-0 bg-surface-gray px-4 pt-2 ${attached ? "pb-0" : "pb-2"
        }`}
    >
      <div
        className={`flex h-full items-center justify-between gap-2 bg-surface-primary px-8 ${attached ? "rounded-t-lg" : "rounded-lg"
          }`}
      >
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/*
            SVG は最適化の対象外（`dangerouslyAllowSVG` が既定の false のままだと
            /_next/image が 400 を返す）ので `unoptimized` を付ける。ただし
            `unoptimized` は src をそのまま出すため、`"/logo.svg"` と書くと
            basePath（/syllabel）が付かず 404 になる。**静的 import で渡すこと。**
          */}
          <Image
            src={logoMark}
            alt=""
            width={48}
            height={48}
            priority
            unoptimized
            className="shrink-0"
          />
          <span className="font-display text-base font-bold leading-none text-fg-primary">
            Syllabel
          </span>
        </Link>

        {/* Nav links。取り込み前は出さない（行き先に中身が無い） */}
        {showNav && (
          <nav className="flex items-center gap-7">
            {navItems.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href === "/syllabus" ? listHref(listQuery) : item.href}
                  className="flex flex-col items-center gap-1 px-1"
                >
                  <span
                    className={`text-sm leading-none transition-colors ${active
                      ? "font-semibold text-accent"
                      : "font-normal text-fg-secondary hover:text-fg-primary"
                      }`}
                  >
                    {item.label}
                  </span>
                  {/* 下線は1本だけで、選んだ行き先へ横に滑る(layoutId)。
                      ヘッダーは画面を移っても作り直されないので、前の位置から動く */}
                  <span className="relative h-[2px] w-[60px]">
                    {active && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute inset-0 bg-accent"
                        transition={{ type: "spring", damping: 28, stiffness: 400, mass: 0.6 }}
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right area。単位数とリセット（学生アバターは設計から外れた） */}
        <div className="flex shrink-0 items-center gap-4">
          {showNav && profile && (
            <div className="flex items-center gap-8">
              {credits.map(({ val, label, color }) => (
                <div key={label} className="flex items-center gap-1.5" title={`${label}単位`}>
                  {/* 提案や時間割の変更で値が変わったことが分かるよう、数え上げる */}
                  <AnimatedNumber
                    value={val}
                    className={`inline-block origin-bottom tabular-nums text-xl font-bold transition-transform duration-200 ${color}`}
                    countingClassName="scale-110"
                  />
                  <span className="text-xs text-fg-tertiary">{label}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[13px] text-fg-secondary transition-colors hover:text-fg-primary"
          >
            <RotateCcw size={18} />
            <span>リセット</span>
          </button>
        </div>
      </div>
    </header>
  );
}
