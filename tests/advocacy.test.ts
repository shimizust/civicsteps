import { describe, expect, it, vi } from "vitest";
import { alertsForItem, organizations, organizationsForTopic, referenceKey } from "../lib/advocacy";
import { TOPICS, TOPIC_SLUGS } from "../lib/taxonomy";
import { checkSource } from "../ingest/campaignSources";

describe("advocacy coverage", () => {
  it("provides at least one organization for every topic and validates every directory tag", () => {
    expect(TOPICS.filter((t) => !organizationsForTopic(t.slug).length)).toEqual([]);
    expect(organizations.flatMap((o) => o.topics).filter((t) => !TOPIC_SLUGS.has(t))).toEqual([]);
  });

  it("matches official records by jurisdiction and session", () => {
    const state = referenceKey("https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB79");
    expect(state).toBe(referenceKey("https://openstates.org/ca/bills/20252026/SB79/"));
    expect(state).not.toBe(referenceKey("https://openstates.org/ca/bills/20232024/SB79/"));
    expect(referenceKey("https://seattle.legistar.com/LegislationDetail.aspx?ID=12&GUID=a")).not.toBe(
      referenceKey("https://fresno.legistar.com/LegislationDetail.aspx?ID=12"),
    );
    expect(referenceKey("https://congress.gov/bill/119th-congress/house-bill/12/text")).toBe(
      referenceKey("https://www.congress.gov/bill/119th-congress/house-bill/12"),
    );
    expect(alertsForItem([], { url: null, action_url: null })).toEqual([]);
  });

  it("preserves evidence on outages and distinguishes delisting from explicit closure", async () => {
    const org = organizations.find((o) => o.name === "Access Fund")!;
    const url = new URL("/action-alerts/example", org.url).href;
    const html = (body: string) => new Response(body, { headers: { "content-type": "text/html" } });
    const fetch = vi.fn().mockResolvedValueOnce(html('<main><a href="/action-alerts/example">Act</a></main>'))
      .mockResolvedValueOnce(html('<main><h1>Example</h1>This campaign is closed. <a href="https://congress.gov/bill/119th-congress/house-bill/12">Bill</a></main>'));
    vi.stubGlobal("fetch", fetch);
    try {
      const first = await checkSource(org);
      expect(first.alerts[0]).toMatchObject({ url, state: "closed", references: ["congress.gov/bill/119th-congress/house-bill/12"] });
      fetch.mockRejectedValueOnce(new Error("temporary outage"));
      const second = await checkSource(org, first);
      expect(second.checked).toBe(first.checked);
      expect(second.alerts).toEqual(first.alerts);
      fetch.mockResolvedValueOnce(html('<a href="/">Home</a>'));
      const third = await checkSource(org, { ...first, alerts: [{ ...first.alerts[0], state: "listed" }] });
      expect(third.alerts[0].state).toBe("unlisted");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
