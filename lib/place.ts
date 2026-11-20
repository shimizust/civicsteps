/** "ocd-division/country:us/state:wa/place:seattle" → "Seattle, WA". Coarse location only. */
export function placeName(jurisdictionIds: string[], state: string | null): string | null {
  const place = jurisdictionIds.map((j) => j.match(/\/place:([^/]+)$/)?.[1]).find(Boolean);
  if (!place) return state;
  const name = place.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return state ? `${name}, ${state}` : name;
}
