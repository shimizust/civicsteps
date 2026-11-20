import { describe, expect, it } from "vitest";
import fixture from "./fixtures/census-denver.json";
import { parseCensusResponse } from "@/lib/civic/geocode";

describe("parseCensusResponse", () => {
  it("extracts districts as OCD ids", () => {
    const d = parseCensusResponse(fixture)!;
    expect(d.state).toBe("CO");
    expect(d.cd).toBe(1);
    expect(d.sldu).toBe("31");
    expect(d.sldl).toBe("6");
    expect(d.place).toBe("Denver");
    expect(d.jurisdictionIds).toEqual([
      "ocd-division/country:us",
      "ocd-division/country:us/state:co",
      "ocd-division/country:us/state:co/cd:1",
      "ocd-division/country:us/state:co/sldu:31",
      "ocd-division/country:us/state:co/sldl:6",
      "ocd-division/country:us/state:co/county:denver",
      "ocd-division/country:us/state:co/place:denver",
    ]);
  });

  it("returns null when nothing matched", () => {
    expect(parseCensusResponse({ result: { addressMatches: [] } })).toBeNull();
  });
});
