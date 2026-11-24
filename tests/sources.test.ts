import { describe, expect, it } from "vitest";
import fr from "./fixtures/federalregister.json";
import matters from "./fixtures/legistar-matters.json";
import records from "./fixtures/legistar-officerecords.json";
import cg from "./fixtures/congress-bills.json";
import { normalizeFRDoc } from "@/ingest/federalRegister";
import { councilMemberFromRecord, normalizeMatter } from "@/ingest/legistar";
import { congressBillUrl, normalizeCongressBill } from "@/ingest/congress";
import { contentHash } from "@/ingest/normalize";
import { enactedDate, isFeedWorthy, normalizeOpenStatesBill } from "@/ingest/openstates";
import { federalOfficialFromLegislator } from "@/lib/civic/officials";
import { LOCAL_SOURCES } from "@/ingest/legistar.config";

const seattle = LOCAL_SOURCES[0];

describe("Federal Register", () => {
  it("normalizes a proposed rule into a comment period with a regulations.gov action link", () => {
    const item = normalizeFRDoc(fr.results[1] as never)!;
    expect(item.type).toBe("comment_period");
    expect(item.agency).toBe("National Park Service");
    expect(item.comment_deadline).toBe("2026-12-16T23:59:00-05:00");
    expect(item.action_url).toBe("https://www.regulations.gov/commenton/NPS-2026-0265-0001");
  });
});

describe("Legistar", () => {
  it("normalizes a council bill with an upcoming agenda date", () => {
    const item = normalizeMatter(matters[0] as never, seattle, new Date("2026-11-19T00:00:00Z"))!;
    expect(item.external_id).toBe("seattle:17515");
    expect(item.level).toBe("city");
    expect(item.jurisdiction_id).toBe(seattle.jurisdictionId);
    expect(item.event_at).toBe("2026-11-20T12:00:00.000Z");
    expect(item.title.startsWith("CB 121326: An ordinance")).toBe(true);
  });

  it("skips administrative record types", () => {
    expect(normalizeMatter({ ...(matters[0] as object), MatterTypeName: "Appointment" } as never, seattle)).toBeNull();
  });

  it("maps council members", () => {
    const o = councilMemberFromRecord(records[0] as never, seattle);
    expect(o.id).toBe("legistar:seattle:664");
    expect(o.office).toBe("Seattle City Councilmember");
    expect((o.contacts as { emails: string[] }).emails).toEqual(["Dan.Strauss@seattle.gov"]);
  });
});

describe("Congress.gov", () => {
  it("builds public URLs and sponsor links", () => {
    const b = cg.bills[0];
    expect(congressBillUrl(b)).toBe("https://www.congress.gov/bill/119th-congress/senate-bill/933");
    const item = normalizeCongressBill(b as never, { summary: "Authorizes NASA.", sponsors: ["X000001"] });
    expect(item.title).toBe("S. 933: NASA Authorization Act of 2026");
    expect(item.officials).toEqual([{ official_id: "bioguide:X000001", role: "sponsor" }]);
  });
});

describe("Open States", () => {
  const bill = (actions: { date: string; description: string; classification: string[] }[], latest = "2026-09-30") => ({
    id: "ocd-bill/1",
    identifier: "AB 1876",
    title: "Housing",
    session: "20252026",
    jurisdiction: { id: "ocd-jurisdiction/country:us/state:ca/government", name: "California" },
    latest_action_date: latest,
    latest_action_description: actions.at(-1)?.description ?? null,
    openstates_url: "https://openstates.org/ca/bills/20252026/AB1876/",
    actions,
  });
  const signed = bill([
    { date: "2026-08-25", description: "Enrolled and presented to the Governor", classification: [] },
    { date: "2026-09-30", description: "Approved by the Governor.", classification: ["executive-signature"] },
    { date: "2026-09-30", description: "Chaptered by Secretary of State - Chapter 903", classification: ["became-law"] },
  ]);
  const vetoed = bill([{ date: "2026-09-30", description: "Vetoed by Governor.", classification: ["executive-veto"] }]);

  it("dates enactment from the signature or became-law action", () => {
    expect(enactedDate(signed)).toBe("2026-09-30");
    expect(enactedDate(vetoed)).toBeNull();
    expect(enactedDate({})).toBeNull();
    expect(normalizeOpenStatesBill(signed, "ca")).toMatchObject({ level: "state", state: "CA", enacted_at: "2026-09-30" });
  });

  it("keeps bills a feed would show: recent action, or signed in the last 120 days", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(isFeedWorthy(normalizeOpenStatesBill(signed, "ca"), now)).toBe(true);
    expect(isFeedWorthy(normalizeOpenStatesBill(vetoed, "ca"), now)).toBe(false);
    expect(isFeedWorthy({ last_action_at: "2026-11-20", enacted_at: null }, now)).toBe(true);
    expect(isFeedWorthy({ last_action_at: "2026-07-01", enacted_at: "2026-07-01" }, now)).toBe(false);
  });
});

describe("contentHash", () => {
  it("ignores status changes so they don't trigger re-analysis", () => {
    const base = { type: "bill" as const, title: "H.R. 1: Test", description: "x" };
    expect(contentHash(base)).toBe(contentHash({ ...base }));
    expect(contentHash(base)).not.toBe(contentHash({ ...base, description: "y" }));
  });
});

describe("congress-legislators", () => {
  it("maps senators to the state and reps to their district", () => {
    const sen = federalOfficialFromLegislator({
      id: { bioguide: "C000127" },
      name: { first: "Maria", last: "Cantwell", official_full: "Maria Cantwell" },
      terms: [{ type: "sen", state: "WA", party: "Democrat", phone: "202-224-3441", contact_form: "https://example.gov/contact" }],
    });
    expect(sen.jurisdiction_id).toBe("ocd-division/country:us/state:wa");
    const rep = federalOfficialFromLegislator({
      id: { bioguide: "N000191" },
      name: { first: "Joe", last: "Neguse" },
      terms: [{ type: "rep", state: "CO", district: 2 }],
    });
    expect(rep.jurisdiction_id).toBe("ocd-division/country:us/state:co/cd:2");
    expect(rep.name).toBe("Joe Neguse");
  });
});
