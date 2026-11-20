import Anthropic from "@anthropic-ai/sdk";

/** Cheap, high-volume work (item tagging, interest mapping). */
export const FAST_MODEL = process.env.CLAUDE_MODEL_FAST ?? "claude-haiku-5-5";
/** User-facing writing (drafts, summaries of high-significance items). */
export const WRITER_MODEL = process.env.CLAUDE_MODEL_WRITER ?? "claude-sonnet-5-5";

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN;
