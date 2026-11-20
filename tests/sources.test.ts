import { describe, expect, it } from "vitest";
import fr from "./fixtures/federalregister.json";
import matters from "./fixtures/legistar-matters.json";
import records from "./fixtures/legistar-officerecords.json";
import cg from "./fixtures/congress-bills.json";
import { normalizeFRDoc } from "@/ingest/federalRegister";
import { councilMemberFromRecord, normalizeMatter } from "@/ingest/legistar";
import { congressBillUrl, normalizeCongressBill } from "@/ingest/congress";
import { contentHash } from "@/ingest/normalize";
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
