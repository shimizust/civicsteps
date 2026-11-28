import { describe, expect, it, vi } from "vitest";
import {
  alertsForItem,
  extractTextReferences,
  normalizeBillTitle,
  organizations,
  organizationsForTopic,
  referenceKey,
  type CampaignSnapshot,
} from "../lib/advocacy";
import { campaignsForItem } from "../lib/campaigns";
import { groundCampaignExtraction } from "../lib/ai/extractCampaign";
import { TOPICS, TOPIC_SLUGS } from "../lib/taxonomy";
import { checkSource } from "../ingest/campaignSources";

describe("advocacy coverage", () => {
  it("provides at least one organization for every topic and validates every directory tag", () => {
    expect(TOPICS.filter((t) => !organizationsForTopic(t.slug).length)).toEqual([]);
    expect(organizations.flatMap((o) => o.topics).filter((t) => !TOPIC_SLUGS.has(t))).toEqual([]);
  });

  it("matches official records by jurisdiction, session, dockets, and normalized URLs", () => {
    const state = referenceKey("https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202520260SB79");
    expect(state).toBe(referenceKey("https://openstates.org/ca/bills/20252026/SB79/"));
    expect(state).toBe(referenceKey("https://pluralpolicy.com/app/legislative-tracking/bill/details/state-ca-20252026-sb79"));
    expect(state).not.toBe(referenceKey("https://openstates.org/ca/bills/20232024/SB79/"));
    expect(referenceKey("https://seattle.legistar.com/LegislationDetail.aspx?ID=12&GUID=a")).not.toBe(
      referenceKey("https://fresno.legistar.com/LegislationDetail.aspx?ID=12"),
    );
    expect(referenceKey("https://congress.gov/bill/119th-congress/house-bill/12/text")).toBe(
      referenceKey("https://www.congress.gov/bill/119th-congress/house-bill/12"),
    );
    expect(referenceKey("https://www.congress.gov/119/bills/hr7296/BILLS-119hr7296ih.pdf")).toBe(
      "congress.gov/bill/119th-congress/house-bill/7296",
    );
    expect(referenceKey("https://www.regulations.gov/commenton/NPS-2026-0265-0001")).toBe(
      "regulations.gov/nps-2026-0265-0001",
    );
    expect(referenceKey("https://www.regulations.gov/docket/NPS-2026-0265")).toBe("regulations.gov/docket/nps-2026-0265");
    expect(referenceKey("https://www.regulations.gov/docketBrowser?rpp=50&D=NPS-2026-0265")).toBe(
      "regulations.gov/docket/nps-2026-0265",
    );
    expect(referenceKey("https://www.federalregister.gov/d/2026-23228")).toBe("federalregister.gov/2026-23228");
    expect(alertsForItem([], { url: null, action_url: null })).toEqual([]);
  });

  it("extracts federal bills, dockets, scoped state/city bills, and non-historic Act titles from prose", () => {
    const now = new Date("2026-11-28T12:00:00Z");
    const fed = extractTextReferences(
      "Urge Congress to pass the SAVE America Act",
      "Support H.R. 7296, S.1383, and H.R. 717 (Wildlife Movement Through Partnerships Act). " +
        "Protect the America the Beautiful Act! Comment on docket NPS-2026-0265. " +
        "Ignore 118th Congress H.R. 5, Clean Water Act, Endangered Species Act, and U.S. 101.",
      { now },
    );
    expect(fed.references).toEqual(
      expect.arrayContaining([
        "congress.gov/bill/119th-congress/house-bill/7296",
        "congress.gov/bill/119th-congress/senate-bill/1383",
        "congress.gov/bill/119th-congress/house-bill/717",
        "regulations.gov/docket/nps-2026-0265",
      ]),
    );
    expect(fed.references).not.toContain("congress.gov/bill/119th-congress/house-bill/5");
    expect(fed.references).not.toContain("congress.gov/bill/119th-congress/senate-bill/101");
    expect(fed.billTitles).toEqual(
      expect.arrayContaining([
        "save america act",
        "wildlife movement through partnerships act",
        "america the beautiful act",
      ]),
    );
    expect(fed.billTitles).not.toContain("clean water act");
    expect(fed.billTitles).not.toContain("endangered species act");

    const ca = extractTextReferences(
      "California housing & privacy update",
      "Support AB 1043, SB 79, and Senate Bill 1167 this year, building on 2021's AB 2011.",
      { state: "CA", now },
    );
    expect(ca.references).toContain("openstates/ca/bills/20252026/ab1043");
    expect(ca.references).toContain("openstates/ca/bills/20252026/sb79");
    expect(ca.references).toContain("openstates/ca/bills/20252026/sb1167");
    expect(ca.references).not.toContain("congress.gov/bill/119th-congress/senate-bill/1167");
    expect(ca.references).not.toContain("openstates/ca/bills/20252026/ab2011");

    const sea = extractTextReferences("Budget testimony", "Council should amend CB 121326.", { cityClient: "seattle", now });
    expect(sea.references).toContain("legistar/seattle/file/cb121326");
  });

  it("matches items via docket cross-links, congress external_id, legistar file code, and billTitles", () => {
    const snapshot: CampaignSnapshot = [
      {
        organization: "Access Fund",
        attempted: "2026-11-28T00:00:00Z",
        checked: "2026-11-28T00:00:00Z",
        alerts: [
          {
            url: "https://example.org/baaja",
            title: "Tell Congress to Fix BAAJA",
            references: ["congress.gov/bill/119th-congress/senate-bill/5405"],
            billTitles: ["bipartisan american affordability and jobs act"],
            state: "listed",
            checked: "2026-11-28T00:00:00Z",
          },
          {
            url: "https://example.org/parks",
            title: "Stop Hunting in Monuments",
            references: ["regulations.gov/docket/nps-2026-0265"],
            state: "listed",
            checked: "2026-11-28T00:00:00Z",
          },
          {
            url: "https://example.org/seattle",
            title: "Back CB 121326",
            references: ["legistar/seattle/file/cb121326"],
            state: "listed",
            checked: "2026-11-28T00:00:00Z",
          },
        ],
      },
    ];

    expect(
      alertsForItem(snapshot, {
        url: "https://www.federalregister.gov/documents/2026/11/16/2026-23228/hunting",
        action_url: "https://www.regulations.gov/commenton/NPS-2026-0265-0001",
      }).map((a) => a.url),
    ).toEqual(["https://example.org/parks"]);

    expect(
      alertsForItem(snapshot, {
        url: null,
        action_url: null,
        source: "congress",
        external_id: "119-S-5405",
      }).map((a) => a.url),
    ).toEqual(["https://example.org/baaja"]);

    expect(
      alertsForItem(snapshot, {
        url: "https://www.congress.gov/bill/119th-congress/house-bill/9999",
        action_url: null,
        title: "H.R. 9999: Bipartisan American Affordability and Jobs Act of 2026",
        source: "congress",
        external_id: "119-HR-9999",
      }).map((a) => a.url),
    ).toEqual(["https://example.org/baaja"]);

    expect(
      alertsForItem(snapshot, {
        url: "https://seattle.legistar.com/LegislationDetail.aspx?ID=17515",
        action_url: null,
        source: "legistar",
        external_id: "seattle:17515",
        title: "CB 121326: An ordinance relating to land use",
      }).map((a) => a.url),
    ).toEqual(["https://example.org/seattle"]);

    expect(normalizeBillTitle("Congress Must Act")).toBeNull();
    expect(campaignsForItem("openstates", "ocd-bill/1", ["housing"]).related.length).toBeGreaterThan(0);
  });

  it("grounds LLM extractions against the source text", () => {
    const grounded = groundCampaignExtraction(
      {
        position: "Opposed",
        bills: [
          { level: "federal", state: null, identifier: "H.R. 7296", title: "SAVE America Act" },
          { level: "federal", state: null, identifier: "S. 9999", title: "Invented Ghost Bill Act" },
          { level: "federal", state: null, identifier: null, title: "Clean Water Act" },
        ],
        dockets: ["NPS-2026-0265", "FAKE-2026-9999"],
      },
      "Stop the SAVE America Act (H.R. 7296)",
      "We urge Congress to oppose H.R. 7296 and comment on NPS-2026-0265.",
      { now: new Date("2026-11-28T12:00:00Z") },
    );
    expect(grounded.position).toBe("Opposed");
    expect(grounded.references).toEqual([
      "congress.gov/bill/119th-congress/house-bill/7296",
      "regulations.gov/docket/nps-2026-0265",
    ]);
    expect(grounded.billTitles).toEqual(["save america act"]);
  });

  it("preserves evidence on outages and distinguishes delisting from explicit closure", async () => {
    const baseOrg = organizations.find((o) => o.name === "Access Fund")!;
    const org = { ...baseOrg, feeds: undefined, extraHubs: undefined };
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

  it("parses RSS XML and WP-JSON feeds and filters out non-bill blog posts", async () => {
    const rssOrg = {
      name: "Public Citizen",
      url: "https://www.citizen.org/news/action-center/",
      topics: ["economy/consumer-protection"],
      feeds: ["https://www.citizen.org/feed/"],
    };
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Oppose H.R. 3633 now</title>
            <link>https://www.citizen.org/article/oppose-hr-3633/</link>
            <description>Short summary</description>
            <content:encoded><![CDATA[<p>Tell Congress to reject <a href="https://www.congress.gov/bill/119th-congress/house-bill/3633">H.R. 3633</a>.</p>]]></content:encoded>
          </item>
          <item>
            <title>General office update</title>
            <link>https://www.citizen.org/article/office-update/</link>
            <description>Welcome to our new interns and volunteers.</description>
          </item>
        </channel>
      </rss>`;

    const wpOrg = {
      name: "Transportation for America",
      url: "https://t4america.org/",
      topics: ["transportation/transit"],
      feeds: ["https://t4america.org/wp-json/wp/v2/posts?per_page=15"],
    };
    const wpJson = JSON.stringify([
      {
        link: "https://t4america.org/2026/11/protect-transit/",
        title: { rendered: "Protect the Transit Grants Act" },
        content: { rendered: "<p>Congress should pass S. 2400 and the Transit Grants Act.</p>" },
      },
      {
        link: "https://t4america.org/2026/11/podcast/",
        title: { rendered: "New Podcast Episode" },
        content: { rendered: "<p>Listen to our podcast today.</p>" },
      },
    ]);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u === rssOrg.feeds[0]) return new Response(rssXml, { headers: { "content-type": "application/rss+xml" } });
      if (u === wpOrg.feeds[0]) return new Response(wpJson, { headers: { "content-type": "application/json" } });
      return new Response("<html><body></body></html>", { headers: { "content-type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const rssRes = await checkSource(rssOrg);
      expect(rssRes.checked).not.toBeNull();
      expect(rssRes.alerts).toHaveLength(1);
      expect(rssRes.alerts[0]).toMatchObject({
        url: "https://www.citizen.org/article/oppose-hr-3633/",
        references: ["congress.gov/bill/119th-congress/house-bill/3633"],
      });

      const wpRes = await checkSource(wpOrg);
      expect(wpRes.checked).not.toBeNull();
      expect(wpRes.alerts).toHaveLength(1);
      expect(wpRes.alerts[0].billTitles).toContain("transit grants act");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
