"use client";
/**
 * Where an item's sites are, next to the user's ZIP. The user's location is only ever the center of their
 * ZIP, so it's drawn as an approximate area, not a pin. Tiles load from NEXT_PUBLIC_MAP_TILES_URL
 * (OpenStreetMap by default) in the viewer's browser.
 */
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapPlace = { address: string; lat: number; lng: number };

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Roughly the size of a ZIP's populated core; we don't know where in it the user lives.
const ZIP_RADIUS_M = 800;

export function ItemMap({ places, home, zip }: { places: MapPlace[]; home: { lat: number; lng: number } | null; zip: string | null }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    // Leaflet touches `window` on import, so load it in the browser only.
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const css = getComputedStyle(document.documentElement);
      const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const site = color("--color-urgent", "#b4530b");
      const you = color("--color-accent", "#0f5b4f");

      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, className: "map-tiles" }).addTo(map);

      const bounds = L.latLngBounds([]);
      for (const p of places) {
        L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: site, fillOpacity: 1 })
          .bindTooltip(p.address, { direction: "top", offset: [0, -8] })
          .addTo(map);
        bounds.extend([p.lat, p.lng]);
      }
      if (home) {
        L.circle([home.lat, home.lng], { radius: ZIP_RADIUS_M, color: you, weight: 2, dashArray: "5 5", fillColor: you, fillOpacity: 0.12 })
          .bindTooltip(zip ? `Your ZIP (${zip}), approximate` : "Your ZIP, approximate", { direction: "top" })
          .addTo(map);
        bounds.extend(L.latLng(home.lat, home.lng).toBounds(ZIP_RADIUS_M * 2));
      }
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [places, home, zip]);

  return (
    <div>
      <div ref={el} className="isolate h-72 w-full overflow-hidden rounded-lg border border-line sm:h-80" role="img" aria-label="Map of this item's location and your ZIP code" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-urgent ring-2 ring-card" aria-hidden /> Site{places.length > 1 ? "s" : ""} in this item
        </span>
        {home && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-accent bg-accent-soft" aria-hidden /> Your ZIP (approximate)
          </span>
        )}
      </div>
    </div>
  );
}
