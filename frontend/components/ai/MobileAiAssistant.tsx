"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minimize2, Repeat, X } from "lucide-react";
import {
  DEFAULT_ASK_LABEL,
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

  // Ask Bar は押すと何が起きるかを書く。提案前の時間割は質問ではなく希望条件を
  // 受ける欄なので「AIに質問…」とは書かない（design.md §8.3.1）
  const label = conversation.askLabel ?? DEFAULT_ASK_LABEL;

  useEffect(() => {
    setDock({ base, label });
  }, [base, label, setDock]);

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
  const scoped = context.kind !== base.kind || context.label !== base.label;
  // 学生がまだ何も聞いていないうちは、ハーフシートにサジェストを出す（STEP4）。
  // ただし画面全体の文脈で、挨拶のあとに AI が書いたもの（履修提案の説明）が
  // あるときは会話を出す。サジェストで覆うと、提案の説明が全画面にしないと読めない
  const asked = conversation.messages.some((m) => m.role === "user");
  const showSuggestions =
    !full && !asked && suggestions !== null && (scoped || conversation.messages.length <= 1);
  // 提案前の時間割は表が空で、「この時間割について」と出しても指すものが無い
  const showContext = scoped || !conversation.hideBaseContext;

  // 送った結果が背後の画面に出るもの（提案の開始）は、シートを閉じてそれを見せる。
  // 時間割は生成中も snapshot のたびに描かれる（§6.1.1）ので、全画面で覆わない
  const dismissing = {
    ...conversation,
    actions: conversation.actions?.map((action) =>
      action.dismissesSheet
        ? {
            ...action,
            onClick: () => {
              close();
              action.onClick();
            },
          }
        : action,
    ),
  };

  const icon = "text-fg-muted";

  return (
    <motion.div
      layoutId="ai-bar"
      layout
      style={{ borderRadius: "20px 20px 0 0" }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={`fixed inset-x-0 z-50 flex flex-col overflow-hidden bg-surface-gray shadow-sheet ${
        full
          ? "top-3 bottom-0"
          : showSuggestions
            ? "bottom-[58px] h-96"
            : // 会話を出すハーフは、案内の吹き出しと入力欄・断り書きが入る高さにする。
              // 背後の画面の上端は残す（全画面で覆わない）
              "bottom-[58px] h-[min(480px,calc(100dvh-58px-96px))]"
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

        {/* 何について聞くか。科目・コマに絞っているなら、入れ替えアイコンで画面全体の文脈に戻す */}
        {!showContext ? null : full ? (
          <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-border-subtle px-4">
            <ContextChip context={context} rounded="full" />
            <span className="flex-1 truncate text-[11px] text-fg-secondary">について質問</span>
            {scoped && (
              <button type="button" onClick={() => setContext(base)} aria-label={`${base.label}に戻す`}>
                <Repeat size={15} className={icon} />
              </button>
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5 px-4 pt-2.5">
            <ContextChip context={context} rounded="md" />
            <span className="text-[11px] text-fg-secondary">について質問</span>
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
            // 全体を左へ4pxずらす(左12px・右20px)。AI の吹き出しが画面の真ん中に浮いて
            // 見えないように。左右の和は 32px のままにし、吹き出しの幅(欄に対する割合)を変えない
            className="pb-2.5 pl-3 pr-5 pt-3.5"
          >
            {/* 会話を出しているときは、クイックチップと提案の開始・再提案を出す
                （STEP5。ハーフは時間割のクイックチップだけ。ほかの画面はサジェストが担う）。
                PC のパネルと同じく最後の吹き出しの後ろに置く。入力欄の上に固定すると、
                全画面では会話の欄が伸びて「希望条件なしで提案する」が案内の吹き出しから
                離れ、画面の下に落ちる（§8.3.1 は案内の下に置く） */}
            <ChatQuickAsks
              conversation={
                full
                  ? { ...dismissing, quickAsks: conversation.sheetQuickAsks ?? conversation.quickAsks }
                  : { ...dismissing, quickAsks: conversation.sheetQuickAsks ?? [] }
              }
              onAsk={(q) => conversation.send(q, context)}
              // 折り返して並べる。横スクロールにすると、末尾の操作のボタンが
              // 画面の外に切れ、押せることに気づけない
              className="flex-wrap"
            />
          </ChatMessageList>
        )}

        <ChatInputBar
          // 断り書きは書く場所の傍らに出す（§9.1）。ハーフでも会話を出していれば書ける
          conversation={{ ...conversation, note: full || !showSuggestions ? conversation.note : undefined }}
          placeholder={sheetInputPlaceholder(context, conversation.placeholder)}
          onSend={(text) => {
            // 全画面に上げて答えを読ませる（STEP4 → STEP5）。時間割を組み始めたら、
            // 会話の側がシートを閉じて時間割を見せる（design.md §8.3.7）
            if (!full) expand();
            conversation.send(text, context);
          }}
        />
      </motion.div>
    </motion.div>
  );
}
