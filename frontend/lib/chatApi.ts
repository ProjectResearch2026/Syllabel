import type { StudentProfile } from "@/lib/student";
import type { ChatMessage } from "@/lib/chat";

type ChatRequest = {
  profile: StudentProfile | null;
  history: Pick<ChatMessage, "role" | "content">[];
  message: string;
};

export type ProposedCourse = {
  code: string;
  name: string;
  day: "月" | "火" | "水" | "木" | "金";
  period: 1 | 2 | 3 | 4 | 5;
  // 選択必修（selective）は ui-design_phone.pen の時間割セルが出し分ける区分
  type: "required" | "selective" | "elective";
  credits: number;
};

type ProposalRequest = {
  profile: StudentProfile;
  preferences?: { maxCredits?: number };
};

// 共通SSEストリーム処理
async function readSSE(
  url: string,
  body: unknown,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
  // 構造化された候補科目を含むチャンクが来た場合に呼ぶ（AIシートの提案カード用）
  onCourses?: (courses: ProposedCourse[]) => void,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") break;
      try {
        const parsed: {
          text?: string;
          content?: string;
          courses?: ProposedCourse[];
        } = JSON.parse(raw);
        const delta = parsed.text ?? parsed.content ?? "";
        if (delta) {
          full += delta;
          onChunk(delta);
        }
        if (parsed.courses && onCourses) onCourses(parsed.courses);
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return full;
}

/**
 * POST /api/chat/syllabus/{code} のSSEストリームを受信し、
 * chunkごとに onChunk を呼び出す。完了時に全文を返す。
 */
export async function streamCourseChat(
  code: string,
  body: ChatRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return readSSE(`/api/chat/syllabus/${encodeURIComponent(code)}`, body, onChunk, signal);
}

/**
 * POST /api/chat/syllabus のSSEストリームを受信する（シラバス全体チャット）。
 */
export async function streamSyllabusChat(
  body: ChatRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  return readSSE("/api/chat/syllabus", body, onChunk, signal);
}

/**
 * POST /api/chat/proposal のSSEストリームを受信する（提案チャット）。
 */
export async function streamProposalChat(
  body: ChatRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
  onCourses?: (courses: ProposedCourse[]) => void,
): Promise<string> {
  return readSSE("/api/chat/proposal", body, onChunk, signal, onCourses);
}

/**
 * POST /api/proposal のSSEストリームを受信する（履修提案生成）。
 * テキストチャンクは onText に渡し、完了時に構造化データを返す。
 */
export async function streamProposal(
  body: ProposalRequest,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ message: string; courses: ProposedCourse[]; totalCredits: number }> {
  const res = await fetch("/api/proposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let courses: ProposedCourse[] = [];
  let totalCredits = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") break;
      try {
        const parsed: {
          text?: string;
          content?: string;
          courses?: ProposedCourse[];
          total_credits?: number;
        } = JSON.parse(raw);
        const delta = parsed.text ?? parsed.content ?? "";
        if (delta) {
          fullText += delta;
          onText(delta);
        }
        if (parsed.courses) courses = parsed.courses;
        if (parsed.total_credits != null) totalCredits = parsed.total_credits;
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return { message: fullText, courses, totalCredits };
}
