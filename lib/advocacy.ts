import organizations from "./advocacy-organizations.json";
import { topicParent } from "./taxonomy";

export { organizations };
export type Alert = {
  url: string;
  title: string;
  references: string[];
  position?: "Supported" | "Opposed";
  state: "listed" | "closed" | "unlisted" | "unverified";
  checked: string | null;
};
export type SourceCheck = {
  organization: string;
  attempted: string;
  checked: string | null;
  alerts: Alert[];
};
export type CampaignSnapshot = SourceCheck[];

export function organizationsForTopic(slug: string) {
  return organizations.filter((org) => org.topics.some((topic) => topic === slug || topicParent(topic) === slug));
}

// Retain identity-bearing query parameters (especially Legistar IDs).
export function referenceKey(raw?: string | null) {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/$/, "");
  if (host.endsWith(".legistar.com") && /^\/LegislationDetail\.aspx$/i.test(path)) {
    const id = [...u.searchParams].find(([key]) => key.toLowerCase() === "id")?.[1];
    return id && /^\d+$/.test(id) ? host + "/" + id : null;
  }
  if (host === "congress.gov") {
    const bill = path.match(/^\/bill\/\d+(?:th|st|nd|rd)-congress\/[a-z-]+\/\d+(?=\/|$)/i);
    return bill ? host + bill[0].toLowerCase() : null;
  }
  if (host === "regulations.gov") {
    const id = path.match(/^\/(?:document|commenton)\/([^/]+)/i)?.[1];
    return id ? host + "/" + id : null;
  }
  if (host === "federalregister.gov") {
    const id = path.match(/^\/documents\/\d{4}\/\d\d\/\d\d\/([^/]+)/)?.[1];
    return id ? host + "/" + id : null;
  }
  if (host === "leginfo.legislature.ca.gov") {
    const bill = u.searchParams.get("bill_id")?.match(/^(\d{8})0([A-Z]+\d+)$/);
    return bill ? "openstates/ca/bills/" + bill[1] + "/" + bill[2].toLowerCase() : null;
  }
  if ((host === "openstates.org" || host === "open.pluralpolicy.com") && /^\/(?:bill|[a-z]{2}\/bills)\//i.test(path)) {
    return "openstates" + path.toLowerCase();
  }
  return null;
}

export function alertsForItem(snapshot: CampaignSnapshot, item: {url: string | null; action_url: string | null}) {
  const keys = [referenceKey(item.url), referenceKey(item.action_url)].filter(Boolean);
  return snapshot.flatMap((source) => source.alerts
    .filter((alert) => alert.references.some((ref) => keys.includes(ref)))
    .map((alert) => ({ ...alert, organization: source.organization })));
}

export const stateLabel: Record<Alert["state"], string> = {
  listed: "Source available", closed: "Closed", unlisted: "No longer listed or available", unverified: "Availability unverified",
};

export function reviewDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}
