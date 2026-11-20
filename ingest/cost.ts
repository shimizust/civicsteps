/** Rough cost from token usage, for the nightly log. Prices in USD per million tokens (platform.claude.com/docs/en/about-claude/pricing). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};

export type UsageTotals = Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number; batch: boolean }>;

export function estimateCost(usage: UsageTotals) {
  let total = 0;
  const lines: string[] = [];
  for (const [model, u] of Object.entries(usage)) {
    const p = PRICES[model];
    if (!p) {
      lines.push(`  ${model}: ${u.input} in / ${u.output} out (no price on file)`);
      continue;
    }
    const mult = u.batch ? 0.5 : 1;
    const cost = (mult * (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite)) / 1e6;
    total += cost;
    lines.push(`  ${model}: ${u.input} in, ${u.output} out, ${u.cacheRead} cache-read → $${cost.toFixed(4)}`);
  }
  return { total, lines };
}
