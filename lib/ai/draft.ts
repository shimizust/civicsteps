/** Streams an AI draft. Prompt construction lives in ./draftPrompt (shared with the browser). */
import { anthropic, WRITER_MODEL } from "./client";
import { buildDraftPrompt, DRAFT_SYSTEM, type DraftInput } from "./draftPrompt";

export * from "./draftPrompt";

/**
 * Streams the draft as plain text. Uses server-side refusal fallbacks so a classifier
 * false-positive on civic content falls back to another model instead of failing.
 */
export function streamDraft(input: DraftInput): { text: ReadableStream<Uint8Array>; done: Promise<{ content: string; model: string }> } {
  const stream = anthropic().beta.messages.stream({
    model: WRITER_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildDraftPrompt(input) }],
  });

  let content = "";
  let resolveDone!: (v: { content: string; model: string }) => void;
  let rejectDone!: (e: unknown) => void;
  const done = new Promise<{ content: string; model: string }>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const encoder = new TextEncoder();
  const text = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            content += ev.delta.text;
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          throw new Error("The AI declined to draft this message. Use “Copy prompt” to draft it elsewhere.");
        }
        controller.close();
        resolveDone({ content, model: final.model });
      } catch (err) {
        controller.error(err);
        rejectDone(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return { text, done };
}
