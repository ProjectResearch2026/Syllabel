"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  buildTimetable,
  checkTimetable,
  streamTimetableAssistant,
  type TimetableContext,
  type TimetableReport,
} from "@/lib/chatApi";
import { replyStream, useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { useProposalStore } from "@/lib/proposal";
import { useStudentContext } from "@/lib/studentContext";
import { buildPlayer } from "@/lib/timetableBuild";
import {
  TIMETABLE_QUICK_ASKS,
  timetableSuggestions,
  useAiStore,
  type AiContext,
  type AiConversation,
} from "@/lib/ai";

/**
 * 時間割の画面（`/proposal`）の対話。design.md §8.3。
 *
 * **入力欄の宛先は1つである**（§8.3.1）。何を書いても `POST /api/timetable/assistant` に
 * 送り、組み直すか・質問に答えるかはアシスタントが決める。「何ができる?」のような
 * 発話にも答えられる。時間割と条件は frontend が持ち、毎回送る（サーバは状態を
 * 持たない。要件§5.2）。
 *
 * **画面に到達しただけでは組み立てない**（§8.3）。学生が希望を書くか、「希望条件なしで
 * 提案する」を押したときに始める。後者はアシスタントを通さず `POST /api/timetable/build`
 * を直接引く（モデルを待たないので数秒で返る）。
 *
 * 組み立ての手順（`step`）は `lib/timetableBuild.ts` が間を空けて時間割に描く（§8.3.7）。
 *
 * **PC のパネル（`ChatPanel`）とモバイルの AI シート（`MobileProposalPage` の
 * `MobileAiAssistant`）の双方がこれを使う**（`useProposalAssistant()`）。
 * 両者は `/proposal` で同時に mount される（表示は CSS で切り替わる）ので、
 * 会話は両方から同じ `proposalMessages`（§5.2.2）を読み書きする。送信中かどうかも
 * 吹き出しの `streaming` から導き、**どちらから送っても両方の画面が同じ状態を映す**。
 */

/** 会話の系統。履歴（「最近のチャット」）もこの単位で分かれる */
const SCOPE = "proposal" as const;

/** 案内の吹き出し。1通目に固定で置くため id を固定する */
const INTRO_ID = "proposal-intro";

/** 送った直後、応答が届くまでの文言（§4.1.4） */
export const ASSISTANT_THINKING_LABEL = "読んでいます…";

/** 「希望条件なしで提案する」で組み立てを待つあいだの文言。モデルを呼ばないので短い */
export const BUILD_THINKING_LABEL = "時間割を組んでいます…";

/**
 * 入力欄に添える断り書き（§9.1）。取り込み時の確認ウィンドウが同意を
 * 得ているのは成績表についてであり、**学生がその場で自由に書く文章までは覆わない。**
 */
export const PREFERENCES_NOTE =
  "入力した内容は学内のAIサーバへ送られ、100日間記録されます。";

/**
 * 何ができるかが分かるように例を添える（§8.3.2）。モバイルはハーフシートに
 * 入力欄・断り書きと並べて出すので、そこに収まる長さに保つ
 */
const INTRO_TEXT = [
  "時間割について話しかけてください。希望に沿って時間割を組み、科目や卒業要件についての質問にも答えます。",
  "",
  "例:",
  "- 週に1日は全休にしたい",
  "- 必修だけ入れて",
  "- 金曜の5限は避けたい",
  "",
  "特に希望が無ければ「希望条件なしで提案する」を押してください。",
].join("\n");

/** 会話をやり直したときの1通目。時間割はそのまま残る */
const CONTINUE_TEXT = "時間割はそのままです。続けて希望や質問を書いてください。";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `proposal-${prefix}${seq}`;
}

function hhmm(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function assistant(id: string, content: string, streaming = false): ChatMessage {
  return { id, role: "assistant", content, time: hhmm(), streaming };
}

/**
 * 受信の途中で会話を退避するとき、本文の無い吹き出しを中断の旨に置き換える
 * （§4.1.4）。`archive()` は `streaming` を下ろして保存するため、そのままでは
 * 戻したときに指標も本文も無い空の吹き出しになる。
 */
function settle(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.streaming && !m.content
      ? { ...m, streaming: false, content: "応答の途中で会話を切り替えました。" }
      : m,
  );
}

/** 吹き出し1件だけを書き換える。会話は store にあるので id で引く */
function patchMessage(id: string, patch: Partial<ChatMessage>): void {
  useChatStore.setState((state) => ({
    proposalMessages: state.proposalMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

/** 学生が手で直した時間割のレポートを引き直すまでの間（続けて直すあいだは引かない） */
const CHECK_DEBOUNCE_MS = 500;

/**
 * レポートの引き直しは画面に1本だけ。PC のパネルとモバイルのシートが同時に mount され、
 * 両方の effect がここを呼ぶので、後から来た方が前の予約を取り消す
 */
let checkTimer: ReturnType<typeof setTimeout> | null = null;
let checkAbort: AbortController | null = null;

function scheduleCheck(body: TimetableContext, onReport: (report: TimetableReport) => void): void {
  if (checkTimer !== null) clearTimeout(checkTimer);
  checkAbort?.abort();
  const ctrl = new AbortController();
  checkAbort = ctrl;
  checkTimer = setTimeout(() => {
    checkTimer = null;
    checkTimetable(body, ctrl.signal)
      .then((report) => {
        // 待つあいだに時間割が組み直されていたら当てない
        if (useProposalStore.getState().courses === body.timetable) onReport(report);
      })
      .catch(() => {}); // 出せなくても時間割は使える
  }, CHECK_DEBOUNCE_MS);
}

export type ProposalConversation = {
  messages: ChatMessage[];
  /** 送信中（アシスタントの応答中、または組み立て中）。入力欄を止める */
  streaming: boolean;
  /** 「希望条件なしで提案する」で組み立てを待っている（モデルを呼ばない） */
  building: boolean;
  /** 時間割を持っている */
  hasTimetable: boolean;
  /** 時間割を組めるか。前提が揃わないときは `blockedReason` に理由が入る */
  canStart: boolean;
  /** 組めない理由。組めるときは null */
  blockedReason: string | null;
  send: (text: string) => void;
  /** 希望条件なしで組み立てる（`/api/timetable/build`） */
  startWithoutPreferences: () => void;
  /** 時間割は残したまま、会話だけをやり直す */
  newChat: () => void;
  history: ReturnType<typeof useChatHistory>["entries"];
  selectHistory: (id: string) => void;
};

export function useProposalConversation(): ProposalConversation {
  const { profile, context, blockedReason } = useStudentContext();
  const { status, courses, conditions, reportStale, busy } = useProposalStore();
  const { setBusy, setConditions, setReport } = useProposalStore();
  const messages = useChatStore((s) => s.proposalMessages);
  const setMessages = useChatStore((s) => s.setProposalMessages);
  const { entries, archive, restore } = useChatHistory(SCOPE);
  const abortRef = useRef<AbortController | null>(null);
  const canStart = blockedReason === null;

  const hasTimetable = status === "done";
  // アシスタントを通さない組み立て(「希望条件なしで提案する」)。アシスタントが組み直す
  // ときは `busy` が立っている
  const building = status === "loading" && !busy;
  const streaming = busy || status === "loading" || messages.some((m) => m.streaming);

  // 1通目の案内（§8.3.2）
  useEffect(() => {
    if (messages.length > 0) return;
    setMessages([assistant(INTRO_ID, blockedReason ?? INTRO_TEXT)]);
  }, [messages.length, blockedReason, setMessages]);

  // 学生が手で直した時間割のレポートを引き直す（モデルは呼ばない）。アシスタントは
  // リクエストのたびに backend が計算し直すので、ここで引くのは画面に出すためである
  useEffect(() => {
    if (!reportStale || status !== "done" || !profile || !context) return;
    scheduleCheck({ studentProfile: profile, ...context, timetable: courses, conditions }, setReport);
  }, [reportStale, status, profile, context, courses, conditions, setReport]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || streaming || !profile || !context) return;

      const assistantId = nextId("a");
      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));
      const time = hhmm();
      setMessages([
        ...messages,
        { id: nextId("u"), role: "user", content: text, time },
        { id: assistantId, role: "assistant", content: "", time, streaming: true },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      const reply = replyStream((update) => patchMessage(assistantId, update));
      let failed = false;
      let built: Promise<void> | null = null;

      streamTimetableAssistant(
        {
          studentProfile: profile,
          ...context,
          timetable: courses,
          conditions,
          // 対話全体を1本で送る。末尾が今回の発話（§6.1）
          messages: [...history, { role: "user", content: text }],
        },
        {
          ...reply.handlers,
          onBuild: () => {
            buildPlayer.begin();
            // モバイルはシートを閉じて、時間割が組み上がっていくところを見せる（§8.3.7）。
            // 説明はシートを開き直すと読める
            useAiStore.getState().close();
          },
          onStep: (step) => buildPlayer.step(step),
          onTimetable: (timetable) => {
            built = buildPlayer.finish(timetable);
          },
          onConditions: setConditions,
        },
        ctrl.signal,
      )
        .catch((err) => {
          reply.flush();
          if ((err as Error).name === "AbortError") return;
          failed = true;
          patchMessage(assistantId, { content: "申し訳ありません。応答の取得に失敗しました。" });
        })
        .finally(() => {
          reply.end();
          // 組み立てが始まったのに時間割が届かなかった（失敗・中断）。元の時間割へ戻す
          if (!built && buildPlayer.pending) buildPlayer.cancel();
          setBusy(false);
          patchMessage(assistantId, {
            streaming: false,
            // delta も error も来ずに終わると本文が空のまま残る（§4.1.4）。
            // 失敗の文言は catch が入れているので上書きしない
            ...(reply.content() || failed ? {} : { content: "応答を受け取れませんでした。" }),
          });
          if (abortRef.current === ctrl) abortRef.current = null;
        });
    },
    [streaming, profile, context, messages, setMessages, setBusy, courses, conditions, setConditions],
  );

  /**
   * 希望条件なしで組み立てる。アシスタントを通さないので、吹き出しには backend が
   * レポートから作った決まった説明を出す
   */
  const startWithoutPreferences = useCallback(() => {
    if (streaming || !profile || !context) return;
    const id = nextId("b");
    setMessages([...messages, assistant(id, "", true)]);
    buildPlayer.begin();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    buildTimetable(
      { studentProfile: profile, ...context, timetable: courses, conditions: {}, mode: "rebuild" },
      ctrl.signal,
    )
      .then(async (result) => {
        setConditions(result.conditions);
        result.steps.forEach((step) => buildPlayer.step(step));
        await buildPlayer.finish(
          { courses: result.timetable, totalCredits: result.totalCredits, report: result.report },
          result.message,
        );
        patchMessage(id, { content: result.message, streaming: false });
      })
      .catch((err) => {
        buildPlayer.cancel();
        patchMessage(id, {
          streaming: false,
          content:
            (err as Error).name === "AbortError"
              ? "時間割の組み立てを中断しました。"
              : "時間割を組めませんでした。もう一度お試しください。",
        });
      })
      .finally(() => {
        if (abortRef.current === ctrl) abortRef.current = null;
      });
  }, [streaming, profile, context, messages, setMessages, courses, setConditions]);

  /** 時間割はそのままに、会話だけをやり直す */
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    archive(SCOPE, settle(messages));
    setMessages([assistant(INTRO_ID, hasTimetable ? CONTINUE_TEXT : INTRO_TEXT)]);
  }, [archive, messages, setMessages, hasTimetable]);

  const selectHistory = useCallback(
    (id: string) => {
      const restored = restore(SCOPE, id);
      if (!restored) return;
      abortRef.current?.abort();
      archive(SCOPE, settle(messages));
      setMessages(restored);
    },
    [restore, archive, messages, setMessages],
  );

  return {
    messages,
    streaming,
    building,
    hasTimetable,
    canStart,
    blockedReason,
    send,
    startWithoutPreferences,
    newChat,
    history: entries,
    selectHistory,
  };
}

/**
 * 時間割（`/proposal`）の AI 会話を、PC のパネルとモバイルのシートが共有する形にする。
 *
 * 時間割が無いあいだ、モバイルでは**ハーフシートのサジェストを出さない**
 * （`suggestionsFor` が null）。サジェストは今の時間割についての質問で、表が空では
 * 答えようがない。代わりにハーフシートに案内と入力欄を出す。送っただけではシートを
 * 閉じず（質問への答えはシートで読む）、組み立てが始まったときに閉じて、時間割が
 * 埋まっていくところを見せる（`onBuild`）。
 */
export function useProposalAssistant(): AiConversation {
  const conversation = useProposalConversation();
  const {
    messages,
    streaming,
    building,
    hasTimetable,
    canStart,
    send,
    startWithoutPreferences,
    newChat,
    history,
    selectHistory,
  } = conversation;
  const loading = useProposalStore((s) => s.status === "loading");

  const sendWithContext = useCallback(
    (text: string, context?: AiContext) => {
      if (!canStart) return;
      // 科目・コマを参照中に書いた質問は、何についての質問かを添えて送る
      const scoped =
        context && (context.kind === "course" || context.kind === "slot")
          ? `${context.label}について: ${text.trim()}`
          : text;
      send(scoped);
    },
    [canStart, send],
  );

  return useMemo<AiConversation>(
    () => ({
      title: "AI履修アシスタント",
      messages,
      streaming,
      thinkingLabel: building ? BUILD_THINKING_LABEL : ASSISTANT_THINKING_LABEL,
      askLabel: loading
        ? "時間割を組んでいます…"
        : streaming
          ? "AIが答えています…"
          : !hasTimetable && canStart
            ? "AIに希望を伝えて提案を受ける"
            : undefined,
      hideBaseContext: !hasTimetable,
      placeholder: hasTimetable
        ? "希望や質問を入力"
        : "希望や質問を入力（例: 週に1日は全休にしたい）",
      inputDisabled: !canStart,
      send: sendWithContext,
      sheetQuickAsks: hasTimetable ? TIMETABLE_QUICK_ASKS : undefined,
      // 時間割があるときは条件を会話で変えれば組み直されるので、作り直しのボタンは置かない
      actions:
        !canStart || hasTimetable
          ? []
          : [
              {
                label: "希望条件なしで提案する",
                onClick: startWithoutPreferences,
                dismissesSheet: true,
              },
            ],
      // 学生がその場で書く文章が記録されることを、書く場所の傍らで示す（§9.1）
      note: canStart ? PREFERENCES_NOTE : undefined,
      history,
      onSelectHistory: selectHistory,
      onNewChat: canStart ? newChat : undefined,
      suggestionsFor: hasTimetable ? timetableSuggestions : undefined,
    }),
    [
      messages,
      streaming,
      building,
      loading,
      hasTimetable,
      canStart,
      sendWithContext,
      startWithoutPreferences,
      history,
      selectHistory,
      newChat,
    ],
  );
}
