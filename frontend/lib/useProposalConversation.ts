"use client";

import { useCallback, useEffect, useRef } from "react";
import { streamProposal, streamProposalChat } from "@/lib/chatApi";
import { useChatStore, type ChatMessage } from "@/lib/chat";
import { useChatHistory } from "@/lib/chatHistory";
import { programCodeOf, resolveAdmissionYear } from "@/lib/programs";
import { useProposalStore } from "@/lib/proposal";
import { useStudentStore } from "@/lib/student";

/**
 * 履修提案画面（`/proposal`）の対話。design.md §8.3。
 *
 * **提案は学生の指示で始める。画面に到達しただけでは `POST /api/proposal` を
 * 撃たない**（§8.3）。提案は1回に4〜5分かかり（§7.2）、その1本は希望条件
 * （`preferences`）を含めて投げるものだからである。
 *
 * **1つの入力欄が、提案の有無によって2つの口に向かう**（§8.3.1）。
 *
 * | 送信時の状態 | 宛先 |
 * |---|---|
 * | 提案を持っていない（`idle` / `error`） | `POST /api/proposal`（本文がそのまま `preferences`） |
 * | 提案を持っている（`done`） | `POST /api/chat/proposal` |
 *
 * 分岐を「何通目か」ではなく提案の有無に置くのは、後者が `proposal` を必須とし
 * 無ければ 422 を返す（§6.1）ためである。
 *
 * **PC（`ChatPanel`）とモバイル（`MobileProposalPage`）の双方がこれを使う。**
 * 両者は `/proposal` で同時に mount される（表示は CSS で切り替わる）ので、
 * 会話は両方から同じ `proposalMessages`（§5.2.2）を読み書きする。送信中かどうかも
 * 吹き出しの `streaming` から導き、**どちらから送っても両方の画面が同じ状態を映す**。
 */

/** 会話の系統。履歴（「最近のチャット」）もこの単位で分かれる */
const SCOPE = "proposal" as const;

/** 案内の吹き出し。1通目に固定で置くため id を固定する */
const INTRO_ID = "proposal-intro";

/** 提案の生成中に出す吹き出し。完了時に summary へ差し替える */
const GENERATING_ID = "proposal-generating";

/**
 * 希望条件が空のまま提案が返ったときの1通目。backend の summary が空になることは
 * 通常ないが、空文字を吹き出しに置くと生成中のキャレットだけが残るため備える。
 */
const FALLBACK_SUMMARY =
  "卒業要件から逆算し、今期の履修を提案しました。ご質問があればお気軽にどうぞ。";

/**
 * 希望条件の入力欄に添える断り書き（§9.1）。取り込み時の確認ウィンドウが同意を
 * 得ているのは成績表についてであり、**学生がその場で自由に書く文章までは覆わない。**
 */
export const PREFERENCES_NOTE =
  "入力した内容は学内のAIサーバへ送られ、100日間記録されます。";

/** 何を書けばよいかが分かるように例を添える（§8.3.2） */
const INTRO_TEXT = [
  "どんな履修にしたいか、希望を教えてください。提案はそれから作ります。",
  "",
  "例:",
  "- 午前中の科目を多めにしたい",
  "- 必修だけ知りたい",
  "- 週に1日は空けたい",
  "",
  "希望が無ければ「希望条件なしで提案する」を押してください。卒業要件から逆算して組みます。",
].join("\n");

/** 再提案の案内。前回の条件を示し、差分だけ書き足せるようにする（§8.3.3） */
function restartText(previous: string): string {
  if (!previous) return INTRO_TEXT;
  return [
    `前回は「${previous}」という希望で提案しました。`,
    "条件を書き直してください。変えたいところだけで構いません。",
  ].join("\n");
}

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
 * 生成・受信の途中で会話を退避するとき、本文の無い吹き出しを中断の旨に置き換える
 * （§4.1.4）。`archive()` は `streaming` を下ろして保存するため、そのままでは
 * 戻したときに指標も本文も無い空の吹き出しになる。
 */
function settle(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.streaming && !m.content
      ? {
          ...m,
          streaming: false,
          content:
            m.id === GENERATING_ID
              ? "提案の作成を中断しました。"
              : "応答の途中で会話を切り替えました。",
        }
      : m,
  );
}

/** 吹き出し1件だけを書き換える。会話は store にあるので id で引く */
function patchMessage(id: string, patch: Partial<ChatMessage>): void {
  useChatStore.setState((state) => ({
    proposalMessages: state.proposalMessages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }));
}

export type ProposalConversation = {
  messages: ChatMessage[];
  /** 送信中（提案の生成中、または提案チャットの受信中）。入力欄を止める */
  streaming: boolean;
  /**
   * 提案そのものを生成中（`POST /api/proposal`）。チャットの受信中とは分ける —
   * こちらは4〜5分かかり得る（§7.2）ため、生成中の文言に所要時間を添える（§4.1.4）。
   */
  generating: boolean;
  /** 提案を持っている。入力欄の宛先がこれで決まる（§8.3.1） */
  holdsProposal: boolean;
  /** 提案を作れるか。前提が揃わないときは `blockedReason` に理由が入る */
  canStart: boolean;
  /** 提案を作れない理由。作れるときは null */
  blockedReason: string | null;
  send: (text: string) => void;
  /** 希望条件なしで提案を始める（§6.1 の「未指定のときは『特になし』」） */
  startWithoutPreferences: () => void;
  /** 条件を変えて提案し直す（§8.3.3） */
  restart: () => void;
  /** 提案は残したまま、質問のやりとりだけをやり直す */
  newChat: () => void;
  history: ReturnType<typeof useChatHistory>["entries"];
  selectHistory: (id: string) => void;
};

export function useProposalConversation(): ProposalConversation {
  const profile = useStudentStore((s) => s.profile);
  const { status, courses, totalCredits, message: summary, preferences } = useProposalStore();
  const { begin, setSnapshot, setResult, setStatus, discard } = useProposalStore();
  const messages = useChatStore((s) => s.proposalMessages);
  const setMessages = useChatStore((s) => s.setProposalMessages);
  const { entries, archive, restore } = useChatHistory(SCOPE);
  const abortRef = useRef<AbortController | null>(null);

  // 履修要項を引くキーは (課程コード, 入学年度)。プロファイルの `program` は課程名
  // なのでコードに解決する（§4.4.2）。学年でガードするのは、backend の配当年次
  // フィルタが `course.grade <= profile.grade` で絞る（§7.2.1）ため grade を必須と
  // しているからである。**投げても 404 になるものは投げる前に画面で示す**（§8.3.2）。
  const programCode = programCodeOf(profile?.program);
  const admissionYear = resolveAdmissionYear(profile);
  const blockedReason = !profile
    ? "成績表がまだ取り込まれていません。ヘッダーの「マイデータ」から取り込むと、履修提案を作れます。"
    : profile.grade == null
      ? "学年が取り込めていません。ヘッダーの「マイデータ」から学年を入力すると、履修提案を作れます。"
      : !programCode
        ? `課程「${profile.program ?? "未設定"}」に対応する履修要項がありません。ヘッダーの「マイデータ」から課程を選び直してください。`
        : admissionYear == null
          ? "入学年度が分かりません。ヘッダーの「マイデータ」から入学年度を入力してください。"
          : null;
  const canStart = blockedReason === null;

  const holdsProposal = status === "done";
  const generating = status === "loading";
  const streaming = generating || messages.some((m) => m.streaming);

  // 1通目の案内（§8.3.2）。提案後の summary と同じ系統の assistant メッセージで
  // あり、別扱いにする理由が無いので `proposalMessages` に置く。
  useEffect(() => {
    if (messages.length > 0) return;
    setMessages([assistant(INTRO_ID, blockedReason ?? restartText(preferences))]);
  }, [messages.length, blockedReason, preferences, setMessages]);

  /** 提案の生成（§7.2）。`wishes` が空文字なら希望条件なしで投げる */
  const start = useCallback(
    (wishes: string) => {
      if (!profile || !programCode || admissionYear == null || streaming) return;

      const trimmed = wishes.trim();
      const next = [...messages];
      // 学生が書いた条件は会話に残す。空のときは送っていないので残さない
      if (trimmed) {
        next.push({ id: nextId("u"), role: "user", content: trimmed, time: hhmm() });
      }
      next.push(assistant(GENERATING_ID, "", true));
      setMessages(next);
      begin(trimmed);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      streamProposal(
        {
          studentProfile: profile,
          programCode,
          admissionYear,
          preferences: trimmed || null,
        },
        // 組み立て途中の提案。時間割表を逐次描画するために反映する（§6.1.1 / §7.2）
        (snapshot) =>
          setSnapshot(
            snapshot.courses ?? [],
            snapshot.totalCredits ?? 0,
            snapshot.summary ?? "",
          ),
        ctrl.signal,
      )
        .then((result) => {
          setResult(result.courses, result.totalCredits ?? 0, result.summary);
          patchMessage(GENERATING_ID, {
            content: result.summary || FALLBACK_SUMMARY,
            streaming: false,
          });
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") {
            // 会話を切り替えて生成を捨てた（§8.3.3）。`loading` のまま残すと
            // `generating` が真のままになり、入力欄も開始の導線も戻らない
            discard();
            return;
          }
          setStatus("error");
          patchMessage(GENERATING_ID, {
            content: "提案を作れませんでした。もう一度お試しください。",
            streaming: false,
          });
        });
    },
    [
      profile,
      programCode,
      admissionYear,
      streaming,
      messages,
      setMessages,
      begin,
      setSnapshot,
      setResult,
      setStatus,
      discard,
    ],
  );

  /** 提案についての質問（§7.3）。提案を持っているときだけ成立する */
  const ask = useCallback(
    (text: string) => {
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

      let accumulated = "";
      let failed = false;
      streamProposalChat(
        {
          studentProfile: profile,
          proposal: { courses, totalCredits, summary },
          // 対話全体を1本で送る。末尾が今回の質問（§6.1）
          messages: [...history, { role: "user", content: text }],
        },
        (delta) => {
          accumulated += delta;
          patchMessage(assistantId, { content: accumulated });
        },
        ctrl.signal,
      )
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          failed = true;
          patchMessage(assistantId, { content: "申し訳ありません。応答の取得に失敗しました。" });
        })
        .finally(() =>
          patchMessage(assistantId, {
            streaming: false,
            // delta も error も来ずに終わると本文が空のまま残る（§4.1.4）。
            // 失敗の文言は catch が入れているので上書きしない
            ...(accumulated || failed ? {} : { content: "応答を受け取れませんでした。" }),
          }),
        );
    },
    [messages, setMessages, profile, courses, totalCredits, summary],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      // 宛先は提案の有無で決まる（§8.3.1）
      if (holdsProposal) ask(text);
      else start(text);
    },
    [streaming, holdsProposal, ask, start],
  );

  const startWithoutPreferences = useCallback(() => start(""), [start]);

  /**
   * 条件を変えて提案し直す（§8.3.3）。提案を捨て、提案チャットの履歴を退避する
   * — 前の提案についての問答を残したまま新しい提案を渡すと、**モデルは既に
   * 存在しない提案を根拠に答える**（§6.1 は対話全体を1本で受ける）。
   */
  const restart = useCallback(() => {
    abortRef.current?.abort();
    archive(SCOPE, settle(messages));
    discard();
    setMessages([assistant(INTRO_ID, restartText(preferences))]);
  }, [archive, messages, discard, setMessages, preferences]);

  /** 提案はそのままに、質問のやりとりだけをやり直す */
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    archive(SCOPE, settle(messages));
    setMessages([assistant(INTRO_ID, summary || FALLBACK_SUMMARY)]);
  }, [archive, messages, setMessages, summary]);

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
    generating,
    holdsProposal,
    canStart,
    blockedReason,
    send,
    startWithoutPreferences,
    restart,
    newChat,
    history: entries,
    selectHistory,
  };
}
