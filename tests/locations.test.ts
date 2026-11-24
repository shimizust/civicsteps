import { describe, expect, it } from "vitest";
import { extractAddresses, formatMiles, milesBetween, nearest } from "@/lib/locations";

describe("extractAddresses", () => {
  it("finds addresses in Legistar planning items", () => {
    expect(
      extractAddresses(
        "Proposed Project: USE PERMIT: to allow a religious institution within an existing commercial building.\nLocation: 645 W. Fremont Avenue (APN:202-06-002)",
      ),
    ).toEqual(["645 W. Fremont Avenue"]);
    expect(extractAddresses("Interim Housing Community at 1240 Fair Oaks Way; and Find this Action Exempt")).toEqual(["1240 Fair Oaks Way"]);
    expect(extractAddresses("Two Affordable Housing Sites, Located at 1171 Sonora Court and 220 Humboldt Court")).toEqual([
      "1171 Sonora Court",
      "220 Humboldt Court",
    ]);
  });

  it("keeps the first number of a range, and multi-word and ordinal streets", () => {
    expect(extractAddresses("redevelop 1250-1290 Lakeside Dr. with housing")).toEqual(["1250 Lakeside Dr"]);
    expect(extractAddresses("at 100 North Mathilda Avenue")).toEqual(["100 North Mathilda Avenue"]);
    expect(extractAddresses("at 1500 3rd Avenue")).toEqual(["1500 3rd Avenue"]);
    expect(extractAddresses("at 400 El Camino Real Way")).toEqual(["400 El Camino Real Way"]);
  });

  it("dedupes and ignores non-addresses", () => {
    expect(extractAddresses("645 Fremont Ave ... later 645 Fremont Ave.")).toEqual(["645 Fremont Ave"]);
    expect(extractAddresses("Adopt the FY 2026 Budget and 2027 Work Plan")).toEqual([]);
    expect(extractAddresses("Phase 1 Main Street improvements")).toEqual([]);
    expect(extractAddresses(null)).toEqual([]);
  });
});

describe("distances", () => {
  const sunnyvale = { lat: 37.3688, lng: -122.0363 };
  const mountainView = { lat: 37.3861, lng: -122.0839 };

  it("computes miles between points", () => {
    expect(milesBetween(sunnyvale, mountainView)).toBeCloseTo(2.87, 1);
    expect(milesBetween(sunnyvale, sunnyvale)).toBe(0);
  });

  it("formats distances", () => {
    expect(formatMiles(0.04)).toBe("< 0.1 mi");
    expect(formatMiles(1.44)).toBe("1.4 mi");
    expect(formatMiles(12.6)).toBe("13 mi");
  });

  it("picks the nearest place", () => {
    expect(nearest(sunnyvale, [{ ...mountainView, id: "mv" }, { ...sunnyvale, id: "sv" }])?.id).toBe("sv");
    expect(nearest(null, [sunnyvale])).toBeNull();
  });
});
