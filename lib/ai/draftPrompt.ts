/**
 * Pure prompt building for drafts — no SDK import, so it can run in the browser for the
 * "copy this prompt to your own AI" fallback. Privacy: only coarse location (city/state)
 * and official names go into the prompt, never the ZIP code or the user's name.
 */
export type DraftKind = "email" | "call_script" | "public_comment";
export type Stance = "support" | "oppose" | "concerned" | "question";

export const STANCE_LABEL: Record<Stance, string> = {
  support: "I support this",
  oppose: "I oppose this",
  concerned: "I have concerns / want changes",
  question: "I have a question",
};

export type DraftInput = {
  kind: DraftKind;
  stance: Stance;
  personalNote: string;
  item: {
    title: string;
    type: string;
    summary: string | null;
    url: string | null;
    external_id: string;
    agency: string | null;
    comment_deadline: string | null;
  };
  official: { name: string; office: string } | null;
  place: string | null; // "Boulder, CO"
};

const KIND_RULES: Record<DraftKind, string> = {
  email:
    "Write an email to the official. Include a short subject line on the first line as 'Subject: ...'. 120-200 words. Open by saying the writer is a constituent (mention their city if given), state the item and the position in the first two sentences, give the personal reason, then one clear, specific ask. Polite and direct.",
  call_script:
    "Write a phone script for calling the official's office, readable aloud in 45-75 seconds. Start with 'Hi, my name is [Your name] and I'm a constituent from ...'. Staff answer these calls, so state the item and position immediately, give the personal reason in one or two sentences, make one ask, and end by asking the staffer to log the position.",
  public_comment:
    "Write a public comment for the agency's official comment docket. 200-400 words. Agencies weigh substantive, specific, unique comments, not volume, so: reference the docket/document ID, explain how the proposal affects the writer directly, raise concrete points about the proposal's effects, and if opposing or concerned, suggest a specific alternative or change. Formal but personal. No form-letter phrasing.",
};

export const DRAFT_SYSTEM = `You help residents write short, effective messages to their elected officials and to government agencies. You write in the resident's own voice, first person.

Rules:
- Keep the resident's personal connection central; it is what makes a message count. Use their note faithfully and do not embellish it with invented details.
- Do not invent facts, statistics, quotes or legal claims. Rely only on the item information given.
- Respectful tone, no partisan attacks, no threats, no exaggeration.
- Use [Your name] as the only placeholder. Never add other placeholders.
- Output only the message text, no commentary before or after.`;

export function buildDraftPrompt(input: DraftInput): string {
  const { item, official } = input;
  const recipient =
    input.kind === "public_comment"
      ? `${item.agency ?? "The agency"} (public comment docket)`
      : official
        ? `${official.name}, ${official.office}`
        : "my elected official";
  const lines = [
    `Write: ${KIND_RULES[input.kind]}`,
    "",
    `Recipient: ${recipient}`,
    input.place && `Writer's location: ${input.place}`,
    "",
    `Item: ${item.title}`,
    `Item type: ${item.type.replace("_", " ")}`,
    `Identifier: ${item.external_id}`,
    item.summary && `Summary: ${item.summary}`,
    item.comment_deadline && `Comment deadline: ${new Date(item.comment_deadline).toDateString()}`,
    item.url && `Link: ${item.url}`,
    "",
    `Writer's position: ${STANCE_LABEL[input.stance]}`,
    `Writer's personal connection (in their words): ${input.personalNote.trim()}`,
  ];
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

/** Full prompt including system instructions, for pasting into any chatbot. */
export function copyablePrompt(input: DraftInput): string {
  return `${DRAFT_SYSTEM}\n\n${buildDraftPrompt(input)}`;
}
