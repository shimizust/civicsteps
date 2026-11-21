import { describe, expect, it } from "vitest";
import fixture from "./fixtures/census-denver.json";
import { parseCensusResponse, zipPoint } from "@/lib/civic/geocode";

const at = { zip: "80203", lat: 39.7314, lng: -104.9828 };

describe("zipPoint", () => {
  it("finds the interior point of a ZIP", () => {
    expect(zipPoint("80203")).toEqual({ lat: 39.7314, lng: -104.9828 });
    expect(zipPoint("00601")).not.toBeNull(); // leading zeros survive
  });

  it("returns null for unknown ZIPs", () => {
    expect(zipPoint("00000")).toBeNull();
    expect(zipPoint("8020")).toBeNull();
  });
});

describe("parseCensusResponse", () => {
  it("extracts districts as OCD ids", () => {
    const d = parseCensusResponse(fixture, at)!;
    expect(d.zip).toBe("80203");
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

  it("returns null when the point is outside the US", () => {
    expect(parseCensusResponse({ result: { geographies: {} } }, at)).toBeNull();
    expect(parseCensusResponse({ errors: ["bad"] }, at)).toBeNull();
  });
});
