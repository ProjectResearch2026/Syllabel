import type { StudentProfile } from "@/lib/student";
import type { ChatMessage } from "@/lib/chat";

type SyllabusCourseChatRequest = {
  profile: StudentProfile | null;
  history: Pick<ChatMessage, "role" | "content">[];
  message: string;
};

/**
 * POST /api/chat/syllabus/{code} のSSEストリームを受信し、
 * chunkごとに onChunk を呼び出す。完了時に全文を返す。
 */
export async function streamCourseChat(
  code: string,
  body: SyllabusCourseChatRequest,
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`/api/chat/syllabus/${encodeURIComponent(code)}`, {
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
        const parsed: { text?: string; content?: string } = JSON.parse(raw);
        const delta = parsed.text ?? parsed.content ?? "";
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return full;
}
