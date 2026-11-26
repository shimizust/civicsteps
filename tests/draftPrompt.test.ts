import { describe, expect, it } from "vitest";
import { buildDraftPrompt, copyablePrompt } from "@/lib/ai/draftPrompt";
import { placeName } from "@/lib/place";
import { naiveMapping } from "@/lib/ai/mapInterest";
import { heuristicAnalysis } from "@/lib/ai/heuristic";

const input = {
  kind: "public_comment" as const,
  stance: "concerned" as const,
  personalNote: "I climb in Joshua Tree every winter.",
  item: { title: "Climbing Management Plan", type: "comment_period", summary: "NPS proposes limits on new fixed anchors.", url: null, external_id: "2026-1234", agency: "National Park Service", comment_deadline: "2026-12-16T23:59:00-05:00" },
  official: null,
  place: "Boulder, CO",
};

describe("draft prompt", () => {
  it("includes the personal note, docket id and coarse place only", () => {
    const p = buildDraftPrompt(input);
    expect(p).toContain("I climb in Joshua Tree every winter.");
    expect(p).toContain("Identifier: 2026-1234");
    expect(p).toContain("Writer's location: Boulder, CO");
    expect(p).toContain("National Park Service (public comment docket)");
  });
  it("copyable prompt carries the system rules", () => {
    expect(copyablePrompt(input)).toMatch(/Do not invent facts/);
  });
  it("pairs an enacted law's follow-up goal with the writer's personal story", () => {
    const prompt = copyablePrompt({
      ...input,
      kind: "email",
      lawResponse: "amend",
      item: { ...input.item, type: "bill", enacted_at: "2026-11-12", comment_deadline: null },
    });
    expect(prompt).toContain("Enacted on: November 12, 2026");
    expect(prompt).toContain("Ask for a change to the law");
    expect(prompt).toContain("introduce or support follow-up legislation");
    expect(prompt).toContain("do not ask for a vote on the original bill");
    expect(prompt).toContain(input.personalNote);
    expect(prompt).not.toContain("Writer's position:");
  });
});

describe("helpers", () => {
  it("placeName derives a city from OCD ids", () => {
    expect(placeName(["ocd-division/country:us/state:wa/place:seattle"], "WA")).toBe("Seattle, WA");
    expect(placeName(["ocd-division/country:us/state:ny/place:new_york"], "NY")).toBe("New York, NY");
    expect(placeName([], "CO")).toBe("CO");
  });
  it("naiveMapping keeps distinctive words and finds topics", () => {
    const m = naiveMapping("Climbing access in national parks");
    expect(m.keywords).toEqual(["climbing", "parks"]);
    expect(m.topics).toEqual(expect.arrayContaining(["public-lands/national-parks", "public-lands/climbing-access"]));
  });
  it("heuristic analysis tags park items and marks ceremonial bills as low significance", () => {
    expect(heuristicAnalysis({ title: "Craters of the Moon National Monument; Hunting", description: null, agency: "National Park Service" }).topics).toContain("public-lands/national-parks");
    expect(heuristicAnalysis({ title: "To designate the facility of the United States Postal Service", description: null, agency: null }).significance).toBe(1);
  });
  it("heuristic rules match whole words only", () => {
    expect(heuristicAnalysis({ title: "Business and occupation tax amendments", description: null, agency: null }).topics).not.toContain("transportation/transit");
    expect(heuristicAnalysis({ title: "Permits for motor homes and travel trailers", description: null, agency: null }).topics).not.toContain("public-lands/trails-recreation");
  });
});
