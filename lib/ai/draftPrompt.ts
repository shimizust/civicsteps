import { enactmentDate } from "@/lib/enactment";

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

export const LAW_RESPONSE_IDS = ["implementation", "oversight", "amend", "repeal", "support"] as const;
export type LawResponse = (typeof LAW_RESPONSE_IDS)[number];

export const LAW_RESPONSES = {
  implementation: {
    label: "Ask how the law will roll out",
    ask: "Ask for implementation dates, agency guidance, or how residents can give input. Focus on the question raised by the personal note.",
    stance: "question",
  },
  oversight: {
    label: "Raise an implementation concern",
    ask: "Ask the legislator to raise the specific concern with the responsible agency or request an update on how the agency will address it.",
    stance: "concerned",
  },
  amend: {
    label: "Ask for a change to the law",
    ask: "Ask the legislator to introduce or support follow-up legislation addressing the specific problem described in the personal note.",
    stance: "concerned",
  },
  repeal: {
    label: "Ask for the law to be repealed",
    ask: "Ask the legislator to introduce or support repeal legislation and explain the writer's reason.",
    stance: "oppose",
  },
  support: {
    label: "Support putting the law into practice",
    ask: "Explain why the writer supports the law and ask the legislator to follow its implementation or support a concrete rollout need from the personal note.",
    stance: "support",
  },
} satisfies Record<LawResponse, { label: string; ask: string; stance: Stance }>;

export type DraftInput = {
  kind: DraftKind;
  stance: Stance;
  lawResponse?: LawResponse;
  personalNote: string;
  item: {
    title: string;
    type: string;
    summary: string | null;
    url: string | null;
    external_id: string;
    agency: string | null;
    comment_deadline: string | null;
    enacted_at?: string | null;
    status?: string | null;
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
  const lawResponse = item.enacted_at && input.lawResponse ? LAW_RESPONSES[input.lawResponse] : null;
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
    item.status && `Latest reported status: ${item.status}`,
    item.enacted_at && `Enacted on: ${enactmentDate(item.enacted_at)}`,
    item.summary && `Summary: ${item.summary}`,
    item.comment_deadline && `Comment deadline: ${new Date(item.comment_deadline).toDateString()}`,
    item.url && `Link: ${item.url}`,
    "",
    item.enacted_at && "This bill is already law. Frame the message as follow-up and do not ask for a vote on the original bill. Do not assume the enactment date is the effective date or assert that a comment period, agency rule, deadline, or follow-up bill exists unless the item information establishes it.",
    lawResponse ? `Writer's goal: ${lawResponse.label}. ${lawResponse.ask}` : `Writer's position: ${STANCE_LABEL[input.stance]}`,
    `Writer's personal connection (in their words): ${input.personalNote.trim()}`,
  ];
  return lines.filter((l): l is string => typeof l === "string").join("\n");
}

/** Full prompt including system instructions, for pasting into any chatbot. */
export function copyablePrompt(input: DraftInput): string {
  return `${DRAFT_SYSTEM}\n\n${buildDraftPrompt(input)}`;
}
