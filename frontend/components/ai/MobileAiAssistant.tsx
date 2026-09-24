"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minimize2, Repeat, X } from "lucide-react";
import {
  sheetInputPlaceholder,
  useAiStore,
  type AiContext,
  type AiConversation,
} from "@/lib/ai";
import ChatMessageList from "./ChatMessageList";
import { ChatHeader, ChatInputBar, ChatQuickAsks } from "./ChatParts";
import AiSuggestList from "./AiSuggestList";
import ContextChip from "./ContextChip";

/**
 * モバイルの AI アシスタント（ui-design_phone.pen「★ AI導線マップ」STEP0〜6）。
 *
 * **会話は画面ごとの `AiConversation` を受け取り、PC のパネルと共有する。**
 * 時間割は履修提案の会話、シラバス一覧は全体への質問、講義詳細はその講義への質問で、
 * PC の右のパネルと同じ会話がシートに出る。
 *
 * mount 中はボトムドックに Ask Bar を出させ（`setDock`）、シートは同一画面上に
 * オーバーレイとして開く。ページ遷移を伴わないので、背後の画面（スクロール位置・
 * 選択状態）はそのまま残る。
 */
export default function MobileAiAssistant({
  conversation,
  base,
}: {
  conversation: AiConversation;
  /** 選択が無いときの文脈 */
  base: AiContext;
}) {
  const mode = useAiStore((s) => s.mode);
  const close = useAiStore((s) => s.close);
  const setDock = useAiStore((s) => s.setDock);
  const setSelection = useAiStore((s) => s.setSelection);

  // サジェストを持たない会話（提案前の時間割）は、ハーフを飛ばして全画面で開く（STEP0）
  const openFull = !conversation.suggestionsFor?.(base);

  useEffect(() => {
    setDock({ base, openFull });
  }, [base, openFull, setDock]);

  // 他の画面へ移ったら Ask Bar ごと片づける。文脈を持ち越さない
  useEffect(
    () => () => {
      setDock(null);
      setSelection(null);
      close();
    },
    [setDock, setSelection, close],
  );

  // シートが開いている間は背後の画面をスクロールさせない。PC では同じ画面に
  // mount されていても見えていないので、狭い画面のときだけ止める
  useEffect(() => {
    if (mode === "closed" || !window.matchMedia("(max-width: 767px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, close]);

  const open = mode !== "closed";

  return (
    <div className="md:hidden">
      {/* スクリム。ハーフのときはタブを覆わない（背後が見えたままであることが設計意図） */}
      <AnimatePresence>
        {open && (
          <motion.button
            key="ai-scrim"
            type="button"
            aria-label="閉じる"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`fixed inset-x-0 top-0 z-40 bg-scrim ${
              mode === "full" ? "bottom-0" : "bottom-[58px]"
            }`}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && <AiSheet key="ai-sheet" conversation={conversation} base={base} />}
      </AnimatePresence>
    </div>
  );
}

/**
 * シート本体。
 *
 * layoutId="ai-bar" でボトムドックの Ask Bar と形状モーフィングを共有する。
 * layout プロップでハーフ（384px）⇄ フルスクリーンの遷移もアニメーションする。
 * グラバーは上スワイプで全画面、下スワイプで縮小／クローズ。
 */
function AiSheet({ conversation, base }: { conversation: AiConversation; base: AiContext }) {
  const mode = useAiStore((s) => s.mode);
  const context = useAiStore((s) => s.context);
  const setContext = useAiStore((s) => s.setContext);
  const expand = useAiStore((s) => s.expand);
  const minimize = useAiStore((s) => s.minimize);
  const close = useAiStore((s) => s.close);

  const full = mode === "full";
  const suggestions = conversation.suggestionsFor?.(context) ?? null;
  // 学生がまだ何も聞いていないうちは、ハーフシートにサジェストを出す（STEP4）
  const asked = conversation.messages.some((m) => m.role === "user");
  const showSuggestions = !full && !asked && suggestions !== null;
  const scoped = context.kind !== base.kind || context.label !== base.label;

  const icon = "text-fg-muted";

  return (
    <motion.div
      layoutId="ai-bar"
      layout
      style={{ borderRadius: "20px 20px 0 0" }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={`fixed inset-x-0 z-50 flex flex-col overflow-hidden bg-surface-gray shadow-sheet ${
        full ? "top-3 bottom-0" : "bottom-[58px] h-96"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={conversation.title}
    >
      {/* コンテンツはモーフィング完了後にフェードイン */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14, delay: 0.07 }}
        className="flex flex-1 flex-col overflow-hidden"
      >
        {/* Grabber — ドラッグで展開／折りたたみ */}
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.y < -44 || info.velocity.y < -280) {
              expand();
            } else if (info.offset.y > 64 || info.velocity.y > 280) {
              if (full) minimize();
              else close();
            }
          }}
          whileDrag={{ cursor: "grabbing" }}
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2"
        >
          <span className="h-1 w-10 rounded-full bg-border-primary" />
        </motion.div>

        {/* Header（PC の Chat/Header ＋ 全画面／縮小・閉じる） */}
        <ChatHeader
          conversation={conversation}
          trailing={
            <span className="flex shrink-0 items-center gap-3 pl-0.5">
              {full ? (
                <button type="button" onClick={minimize} aria-label="ハーフシートに戻す">
                  <Minimize2 size={18} className={icon} />
                </button>
              ) : (
                <button type="button" onClick={() => expand()} aria-label="全画面にする">
                  <Maximize2 size={18} className={icon} />
                </button>
              )}
              <button type="button" onClick={close} aria-label="閉じる">
                <X size={20} className={icon} />
              </button>
            </span>
          }
        />

        {/* 参照中の文脈。科目・コマを参照中なら、入れ替えアイコンで画面全体の文脈に戻す */}
        {full ? (
          <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-border-subtle px-4">
            <ContextChip context={context} rounded="full" />
            <span className="flex-1 truncate text-[11px] text-fg-secondary">
              {asked ? "を参照中 ・ 追加で質問中" : "を参照中"}
            </span>
            {scoped && (
              <button type="button" onClick={() => setContext(base)} aria-label={`${base.label}に戻す`}>
                <Repeat size={15} className={icon} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5 px-4 pt-2.5">
            <ContextChip context={context} rounded="md" />
            <span className="text-[11px] text-fg-secondary">を参照中</span>
          </div>
        )}

        {/* 本体: 聞く前はサジェスト、聞いたあとは会話 */}
        {showSuggestions ? (
          <AiSuggestList
            label={suggestions.label}
            items={suggestions.items}
            disabled={conversation.streaming}
            // サジェストはシート内で答える（全画面には上げない。STEP4）
            onPick={(suggestion) => conversation.send(suggestion.prompt)}
          />
        ) : (
          <ChatMessageList
            messages={conversation.messages}
            thinkingLabel={conversation.thinkingLabel}
            showDate={full}
            className="px-4 pb-2.5 pt-3.5"
          />
        )}

        {/* クイックチップ・提案の開始／再提案は全画面のときだけ（STEP0・STEP5） */}
        {full && (
          <ChatQuickAsks
            conversation={
              conversation.sheetQuickAsks
                ? { ...conversation, quickAsks: conversation.sheetQuickAsks }
                : conversation
            }
            onAsk={(q) => conversation.send(q, context)}
            className="shrink-0 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          />
        )}

        <ChatInputBar
          conversation={{ ...conversation, note: full ? conversation.note : undefined }}
          placeholder={sheetInputPlaceholder(context, conversation.placeholder)}
          // 自分で書いて送ると全画面に上げる（STEP4 → STEP5）
          onSend={(text) => {
            if (!full) expand();
            conversation.send(text, context);
          }}
        />
      </motion.div>
    </motion.div>
  );
}
