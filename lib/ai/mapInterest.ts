/** Free-text pet issue ("climbing access at Indian Creek") → taxonomy topics + match keywords. One cheap call when a user saves it. */
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TOPICS } from "@/lib/taxonomy";
import { aiConfigured, anthropic, FAST_MODEL } from "./client";
import { heuristicAnalysis } from "./heuristic";

const topicSlugs = TOPICS.map((t) => t.slug) as [string, ...string[]];

const MappingSchema = z.object({
  topics: z.array(z.enum(topicSlugs)).describe("1-3 most specific matching topic slugs"),
  keywords: z
    .array(z.string())
    .describe(
      "4-10 lowercase keywords likely to appear in bill titles or rule summaries about this interest: places, agencies, programs, activities",
    ),
});
export type InterestMapping = z.infer<typeof MappingSchema>;

const SYSTEM = `You map a person's stated civic interest to topic slugs and search keywords for a civic engagement app.
Keywords should catch relevant government items: include agency names (e.g. "national park service", "bureau of land management"), place names, program names and activity terms. Avoid generic words like "policy" or "government".

Topic slugs:
${TOPICS.map((t) => `- ${t.slug}: ${t.name}`).join("\n")}`;

// Words too generic to be useful search terms on government items.
const GENERIC = new Set(
  ("and the for with access of in on to a an my our about more less new local city state national federal public " +
    "rules rule policy policies law laws act bill program programs issue issues government protect protection support").split(" "),
);

/** Fallback when AI is unavailable: topics from keyword rules, keywords from the label's distinctive words. */
export function naiveMapping(label: string): InterestMapping {
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC.has(w));
  return {
    topics: heuristicAnalysis({ title: label, description: null, agency: null }).topics.slice(0, 3),
    keywords: [...new Set(words)],
  };
}

export async function mapInterest(label: string): Promise<InterestMapping> {
  if (!aiConfigured()) return naiveMapping(label);
  try {
    const res = await anthropic().messages.parse({
      model: FAST_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(MappingSchema) },
      messages: [{ role: "user", content: `Interest: ${label.slice(0, 200)}` }],
    });
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return naiveMapping(label);
    const out = res.parsed_output;
    return {
      topics: [...new Set(out.topics)].slice(0, 4),
      keywords: [...new Set(out.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 12),
    };
  } catch (err) {
    console.error("mapInterest failed", err);
    return naiveMapping(label);
  }
}
