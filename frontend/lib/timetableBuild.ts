import type { BuiltTimetable, TimetableStep } from "@/lib/chatApi";
import { useProposalStore } from "@/lib/proposal";

/**
 * 組み立ての手順（`step`。design.md §6.1.1）を1手ずつ時間割に描く（§8.3.7）。
 *
 * 組み立ては数秒で終わる決定的な処理で、手順はほぼ一度に届く。そのまま当てると表が
 * 一瞬で埋まり、何が起きたかが見えないので、**frontend が間を空けて描く**。backend は
 * 待たない（待ちを足すと「希望条件なしで提案する」も遅くなる）。
 *
 * 時間割の画面の組み立ては一度に1つなので、再生も1本だけを持つ。新しい組み立てを
 * 始めると、描きかけの前の再生は捨てる。
 *
 * **先頭に並ぶ「残す」(`keep`)は1手ずつ描かず、まとめて一度に当てる。** 組み直し
 * (`adjust` / `remove`)は今の時間割の全科目を `keep` として返すため、以前は表を空にして
 * から残す科目を150msずつ入れ直しており、会話で組み直すたびに時間割が一度消えて
 * 入り直して見えた。残す科目は前の表の科目のまま置くので、マスは作り直されない。
 * 1手ずつ描くのは、外す・入れるといった実際に変わる手だけである。
 */

/** 1手の間隔。必修が先に入り、選択科目が1つずつ入るのが目で追える長さ */
export const STEP_INTERVAL_MS = 150;

type Previous = Pick<
  ReturnType<typeof useProposalStore.getState>,
  "status" | "courses" | "totalCredits"
>;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

class BuildPlayer {
  private queue: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private previous: Previous | null = null;
  /** 先頭の `keep` で残す科目。最初の `keep` 以外の手か確定までためておく */
  private kept: TimetableStep["course"][] = [];
  /** 残す科目を表に当てた(以後の手は1手ずつ描く) */
  private started = false;
  /** `finish()` の待ちを解く関数。取りやめたときも解く(待つ側が止まらないように) */
  private waiting: (() => void)[] = [];

  /** 組み立てを始める。前の時間割は手順を描き始めるまで残す */
  begin(): void {
    this.reset();
    const s = useProposalStore.getState();
    this.previous = { status: s.status, courses: s.courses, totalCredits: s.totalCredits };
    s.beginBuild();
  }

  /** 組み立ての1手を描く順に積む */
  step(step: TimetableStep): void {
    if (!this.started && step.kind === "keep") {
      this.kept.push(step.course);
      return;
    }
    this.startSteps();
    this.enqueue(() => useProposalStore.getState().playStep(step));
  }

  /** 組み上がった時間割で確定する。積んだ手順を描き終えてから当てる */
  finish(built: BuiltTimetable, message?: string): Promise<void> {
    this.startSteps();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.enqueue(() => {
        useProposalStore.getState().finishBuild(built, message);
        this.previous = null;
        this.started = false;
        this.waiting = this.waiting.filter((w) => w !== resolve);
        resolve();
      });
    });
  }

  /** 組み上がらずに終わった（失敗・中断）。始める前の時間割へ戻す */
  cancel(): void {
    const previous = this.previous;
    this.reset();
    if (previous) useProposalStore.getState().cancelBuild(previous);
  }

  /** ためた `keep` を一度に当て、表を残す科目だけにする */
  private startSteps(): void {
    if (this.started) return;
    this.started = true;
    const kept = this.kept.flatMap((course) => (course ? [course] : []));
    this.kept = [];
    this.enqueue(() => useProposalStore.getState().startSteps(kept));
  }

  /** 組み立てが始まって、まだ確定していない */
  get pending(): boolean {
    return this.previous !== null;
  }

  private reset(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
    this.previous = null;
    this.kept = [];
    this.started = false;
    const waiting = this.waiting;
    this.waiting = [];
    waiting.forEach((resolve) => resolve());
  }

  private enqueue(action: () => void): void {
    this.queue.push(action);
    if (this.timer === null) this.drain();
  }

  private drain(): void {
    // 途中でリセット・学生の差し替え(`clear()`)があった。描きかけの手順は捨てる
    if (this.previous !== null && useProposalStore.getState().status !== "loading") {
      this.reset();
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      this.timer = null;
      return;
    }
    next();
    this.timer = setTimeout(() => this.drain(), reducedMotion() ? 0 : STEP_INTERVAL_MS);
  }
}

export const buildPlayer = new BuildPlayer();
