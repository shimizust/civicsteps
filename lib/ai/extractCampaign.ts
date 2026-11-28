/** Extracts targeted bills, dockets, and stances from advocacy campaign text using Claude Haiku. */
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  congressReferenceKey,
  currentCongressNumber,
  currentStateSession,
  normalizeBillTitle,
  openStatesReferenceKey,
} from "@/lib/advocacy";
import { aiConfigured, anthropic, FAST_MODEL } from "./client";

export const CampaignExtractionSchema = z.object({
  position: z.enum(["Supported", "Opposed", "Neutral"]).nullable(),
  bills: z.array(
    z.object({
      level: z.enum(["federal", "state", "city"]),
      state: z.string().nullable(),
      identifier: z.string().nullable(),
      title: z.string().nullable(),
    }),
  ),
  dockets: z.array(z.string()),
});
export type CampaignExtraction = z.infer<typeof CampaignExtractionSchema>;

const SYSTEM = `You identify specific, current legislation or federal rulemaking dockets targeted by an advocacy campaign.
Rules:
- Only include bills or dockets the campaign is actively asking supporters to pass, oppose, amend, or comment on.
- Ignore historic laws cited for background (e.g. Clean Water Act, Endangered Species Act, NEPA, Social Security Act, ACA) unless the campaign targets a specific new bill amending them.
- Return empty lists for general pledges, broad issue pages, or executive pressure campaigns without a named bill or rulemaking docket.
- Never guess or invent bill numbers or docket IDs not clearly stated in the text.`;

const FEDERAL_ID_RE = /^(H\.?\s*R\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*Res\.?|S\.?)\s*(\d{1,5})$/i;
const STATE_ID_RE = /^(AB|SB|HB|ACA|SCA|AJR|SJR)\s*(\d{1,5})$/i;
const CITY_ID_RE = /^(CB|Ord\.?|Res\.?)\s*(\d{4,6})$/i;

function compact(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isGroundedTitle(title: string, sourceLower: string): boolean {
  const words = title.split(" ").filter((w) => w.length > 3 && w !== "act" && w !== "bill");
  if (!words.length) return false;
  const hits = words.filter((w) => sourceLower.includes(w)).length;
  return hits >= Math.ceil(words.length / 2);
}

/** Validates and normalizes extracted bills/dockets against the actual campaign text to avoid hallucinations. */
export function groundCampaignExtraction(
  raw: CampaignExtraction,
  sourceTitle: string,
  sourceText: string,
  opts?: { state?: string; cityClient?: string; now?: Date },
): { references: string[]; billTitles: string[]; position?: "Supported" | "Opposed" } {
  const combined = `${sourceTitle}\n${sourceText}`;
  const combinedCompact = compact(combined);
  const combinedLower = combined.toLowerCase();
  const now = opts?.now ?? new Date();
  const congress = currentCongressNumber(now);

  const references = new Set<string>();
  const billTitles = new Set<string>();

  for (const bill of raw.bills) {
    const id = bill.identifier?.trim();
    if (id && combinedCompact.includes(compact(id))) {
      if (bill.level === "federal") {
        const m = id.match(FEDERAL_ID_RE);
        if (m) {
          const type = m[1].replace(/[\s.]+/g, "").toUpperCase();
          const key = congressReferenceKey(congress, type, m[2]);
          if (key) references.add(key);
        }
      } else if (bill.level === "state") {
        const st = (bill.state || opts?.state || "").trim().toUpperCase();
        const m = id.match(STATE_ID_RE);
        if (/^[A-Z]{2}$/.test(st) && m) {
          references.add(openStatesReferenceKey(st, currentStateSession(st, now), `${m[1]}${m[2]}`));
        }
      } else if (bill.level === "city" && opts?.cityClient) {
        const m = id.match(CITY_ID_RE);
        if (m) references.add(`legistar/${opts.cityClient.toLowerCase()}/file/${m[1].replace(/\./g, "").toLowerCase()}${m[2]}`);
      }
    }

    if (bill.title) {
      const norm = normalizeBillTitle(bill.title);
      if (norm && isGroundedTitle(norm, combinedLower)) billTitles.add(norm);
    }
  }

  for (const d of raw.dockets) {
    const clean = d.trim();
    if (/^[A-Za-z0-9-]{6,40}$/.test(clean) && combinedLower.includes(clean.toLowerCase())) {
      references.add(`regulations.gov/docket/${clean.toLowerCase()}`);
    }
  }

  const position = raw.position === "Supported" || raw.position === "Opposed" ? raw.position : undefined;
  return { references: [...references], billTitles: [...billTitles], position };
}

export async function extractCampaign(
  title: string,
  text: string,
  opts?: { state?: string; cityClient?: string },
): Promise<{ references: string[]; billTitles: string[]; position?: "Supported" | "Opposed" } | null> {
  if (!aiConfigured()) return null;
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 3500);
  if (snippet.length < 120) return null;
  try {
    const res = await anthropic().messages.parse({
      model: FAST_MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(CampaignExtractionSchema) },
      messages: [
        {
          role: "user",
          content: `Org scope: ${opts?.state ? `State=${opts.state}` : "Federal/National"}${opts?.cityClient ? `, City=${opts.cityClient}` : ""}\nTitle: ${title.slice(0, 300)}\nText:\n${snippet}`,
        },
      ],
    });
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return null;
    return groundCampaignExtraction(res.parsed_output, title, snippet, opts);
  } catch (err) {
    console.error("extractCampaign failed", err);
    return null;
  }
}
