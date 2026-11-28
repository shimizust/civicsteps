import { createHash } from "node:crypto";
import { load } from "cheerio";
import { campaignIssues } from "../lib/campaigns";
import {
  extractTextReferences,
  organizations,
  referenceKey,
  type Alert,
  type Organization,
  type SourceCheck,
} from "../lib/advocacy";
import { extractCampaign } from "../lib/ai/extractCampaign";

const platforms = [
  "actionnetwork.org",
  "votervoice.net",
  "p2a.co",
  "quorum.us",
  "everyaction.com",
  "engagingnetworks.app",
  "salsalabs.org",
];
const orgDomains = organizations.flatMap((o) =>
  [o.url, ...(o.extraHubs ?? []), ...(o.feeds ?? [])].map((raw) => new URL(raw).hostname.replace(/^www\./, "")),
);
const allowed = [...new Set([...orgDomains, ...platforms, "aclu.org", "eff.org"])];

function permitted(u: URL) {
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    !u.port &&
    allowed.some((domain) => u.hostname === domain || u.hostname.endsWith("." + domain))
  );
}

const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

const NON_CAMPAIGN_PATH =
  /\/(?:donate|donation|give|membership|shop|careers|about|privacy|contact|login|events|ways-to-be-an-advocate|older-drivers-safety-course|subscribe)(?:\/|$)/i;
const INDIVIDUAL_PATH =
  /\/(?:bill|legislation|our-priorities|action-alerts?|take-action|send-message|petitions?|campaigns?|actions?|onlineactions?|advocacy|publications\/detail|a)\/[^/]+/i;
const ASK_TITLE =
  /^(?:email |tell |urge |ask (?:your|congress)|sign (?:our|the) petition|contact your |take action (?:to|on) )/i;
const NON_ADVOCACY_POST =
  /\b(?:intern(?:ship)?s?|merch(?:andise)?|gift\s+guide|careers?|job\s+opening|podcast|webinar|holiday\s+(?:card|gift)|staff\s+pick)\b/i;

function normalizeCandidateUrl(raw: string, base: URL): string | null {
  try {
    const link = new URL(raw, base);
    link.hash = "";
    for (const key of [...link.searchParams.keys()]) {
      if (/^utm_|^refcode$/.test(key)) link.searchParams.delete(key);
    }
    return link.href;
  } catch {
    return null;
  }
}

async function page(url: string) {
  let u = new URL(url);
  for (let redirect = 0; redirect <= 4 && permitted(u); redirect++) {
    const r = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": "CivicSteps campaign directory/1.0" },
    });
    if ([404, 410].includes(r.status)) {
      await r.body?.cancel();
      return null;
    }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      u = new URL(r.headers.get("location")!, u);
      await r.body?.cancel();
      continue;
    }
    if (!r.ok || !r.headers.get("content-type")?.includes("html")) {
      await r.body?.cancel();
      throw new Error("Unavailable");
    }
    const $ = load(await r.text());
    if (/access denied|just a moment|attention required|page not found/i.test($("title").text())) throw new Error("Unavailable");
    $("header, nav, footer, script, style, aside").remove();
    const main = $("main, [role=main]").first();
    const fullBody = $("body");
    const mainTextLen = main.text().trim().length;
    const bodyTextLen = fullBody.text().trim().length;
    // Some CMS templates (e.g. Squarespace) put the action-alert body outside <main>.
    const body = main.length && (mainTextLen >= 500 || bodyTextLen <= mainTextLen * 2) ? main : fullBody;
    const links = body
      .find("a[href]")
      .toArray()
      .flatMap((a) => {
        const href = normalizeCandidateUrl($(a).attr("href") ?? "", u);
        if (!href) return [];
        return [{ url: href, title: $(a).text().trim().replace(/\s+/g, " ") }];
      });
    const letters: Pick<Alert, "url" | "position" | "title" | "references">[] = [];
    if (u.hostname === "www.counties.org") {
      for (const paragraph of body.find("p").toArray()) {
        const text = $(paragraph).text();
        const bills = $(paragraph).find('a[href*="leginfo.legislature.ca.gov"]').toArray();
        const stance = text.match(/CSAC[’']s (support|opposition)(?: and request for (?:signature|veto))? letter/i);
        if (!stance || bills.length !== 1) continue;
        const ref = referenceKey($(bills[0]).attr("href"));
        if (!ref) continue;
        const position = stance[1].toLowerCase() === "support" ? "Supported" : "Opposed";
        const bill = $(bills[0]).text().trim();
        letters.push({
          url: u.href + "#:~:text=" + encodeURIComponent(bill),
          position,
          title: position + " " + bill + " · Published position",
          references: [ref],
        });
      }
    }
    const title = $("h1").first().text().trim() || $("title").text().trim();
    body.find("br").replaceWith("\n");
    body.find("p,div,li,h1,h2,h3,h4,h5,h6,section,article,blockquote,tr,td,th").after("\n");
    const text = body
      .text()
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    return { links, letters, title, text };
  }
  throw new Error("Unverified redirect");
}

function xmlChildText($: ReturnType<typeof load>, el: Parameters<ReturnType<typeof load>>[0], tagNames: string[]): string {
  const children = $(el).children().toArray();
  for (const name of tagNames) {
    const match = children.find((c) => "tagName" in c && c.tagName.toLowerCase() === name);
    if (match) {
      const txt = $(match).text().trim();
      if (txt) return txt;
    }
  }
  return "";
}

type FeedEntry = { url: string; title: string; html: string };

function parseFeedEntries(raw: string, contentType: string, feedUrl: string): FeedEntry[] {
  const base = new URL(feedUrl);
  const trimmed = raw.trimStart();
  if (contentType.includes("json") || trimmed.startsWith("[")) {
    const posts = JSON.parse(raw) as {
      link?: string;
      title?: { rendered?: string };
      content?: { rendered?: string };
      excerpt?: { rendered?: string };
    }[];
    if (!Array.isArray(posts)) return [];
    return posts.slice(0, 15).flatMap((p) => {
      const url = p.link ? normalizeCandidateUrl(p.link, base) : null;
      const title = load(p.title?.rendered ?? "").text().trim();
      if (!url || !title) return [];
      return [{ url, title, html: p.content?.rendered || p.excerpt?.rendered || "" }];
    });
  }

  if (contentType.includes("html") || trimmed.startsWith("<!DOCTYPE") || raw.includes("_Incapsula_Resource")) {
    throw new Error("Unavailable");
  }

  const $ = load(raw, { xmlMode: true });
  const rssItems = $("item").toArray();
  if (rssItems.length) {
    return rssItems.slice(0, 15).flatMap((el) => {
      const rawUrl = xmlChildText($, el, ["link"]) || $(el).find("link").first().text().trim();
      const url = normalizeCandidateUrl(rawUrl, base);
      const title = load(xmlChildText($, el, ["title"])).text().trim();
      const html = xmlChildText($, el, ["content:encoded", "content", "description", "summary"]);
      return url && title ? [{ url, title, html }] : [];
    });
  }

  const atomEntries = $("entry").toArray();
  return atomEntries.slice(0, 15).flatMap((el) => {
    const altHref =
      $(el).find("link[rel='alternate']").attr("href") ??
      $(el).find("link").first().attr("href") ??
      xmlChildText($, el, ["link"]);
    const url = altHref ? normalizeCandidateUrl(altHref, base) : null;
    const title = load(xmlChildText($, el, ["title"])).text().trim();
    const html = xmlChildText($, el, ["content", "summary", "description"]);
    return url && title ? [{ url, title, html }] : [];
  });
}

async function analyzeAlertBody(
  title: string,
  text: string,
  linkUrls: string[],
  org: Organization,
  old: Alert | undefined,
  useAi: boolean,
): Promise<{
  references: string[];
  billTitles: string[];
  position?: "Supported" | "Opposed";
  textHash: string;
}> {
  const linkRefs = linkUrls.map((u) => referenceKey(u)).filter((k): k is string => !!k);
  const textExtracted = extractTextReferences(title, text, { state: org.state, cityClient: org.cityClient });
  const textHash = shortHash(`${title}\n${text.replace(/\s+/g, " ").trim().slice(0, 4000)}`);

  const refs = new Set<string>([...linkRefs, ...textExtracted.references]);
  const titles = new Set<string>(textExtracted.billTitles);
  let position: "Supported" | "Opposed" | undefined;

  if (old?.textHash === textHash) {
    for (const r of old.references) refs.add(r);
    for (const t of old.billTitles ?? []) titles.add(t);
    position = old.position;
  } else if (useAi) {
    const ai = await extractCampaign(title, text, { state: org.state, cityClient: org.cityClient });
    if (ai) {
      for (const r of ai.references) refs.add(r);
      for (const t of ai.billTitles) titles.add(t);
      position = ai.position;
    }
  }

  return {
    references: [...refs],
    billTitles: [...titles],
    ...(position ? { position } : {}),
    textHash,
  };
}

async function fetchFeedAlerts(
  feedUrl: string,
  org: Organization,
  known: Map<string, Alert>,
  now: string,
  useAi: boolean,
): Promise<Alert[]> {
  const r = await fetch(feedUrl, {
    signal: AbortSignal.timeout(9000),
    headers: { "User-Agent": "CivicSteps campaign directory/1.0" },
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error("Unavailable");
  }
  const ct = (r.headers.get("content-type") ?? "").toLowerCase();
  const raw = await r.text();
  const entries = parseFeedEntries(raw, ct, feedUrl);

  const out: Alert[] = [];
  for (const entry of entries) {
    let u: URL;
    try {
      u = new URL(entry.url);
    } catch {
      continue;
    }
    if (!permitted(u) || NON_ADVOCACY_POST.test(entry.title)) continue;

    const $entry = load(entry.html);
    const linkUrls = $entry("a[href]")
      .toArray()
      .flatMap((a) => {
        const href = normalizeCandidateUrl($entry(a).attr("href") ?? "", u);
        return href ? [href] : [];
      });
    $entry("br").replaceWith("\n");
    $entry("p,div,li,h1,h2,h3,h4,h5,h6,section,article,blockquote,tr,td,th").after("\n");
    const entryText = $entry
      .text()
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    const shouldAi =
      useAi &&
      entryText.length >= 120 &&
      (Boolean(org.alertFeed) || /\b(?:H\.?\s*R\.?|S\.|AB|SB|HB|bill|legislation|congress|act|docket|comment)\b/i.test(`${entry.title} ${entryText}`));

    const old = known.get(entry.url);
    const extracted = await analyzeAlertBody(entry.title, entryText, linkUrls, org, old, shouldAi);
    if (!org.alertFeed && extracted.references.length === 0 && extracted.billTitles.length === 0) continue;

    out.push({
      url: entry.url,
      title: entry.title.replace(/\s+/g, " ").slice(0, 200),
      references: extracted.references,
      ...(extracted.billTitles.length ? { billTitles: extracted.billTitles } : {}),
      ...(extracted.position ? { position: extracted.position } : {}),
      checked: now,
      state: "listed",
      textHash: extracted.textHash,
    });
  }
  return out;
}

function mergeAlerts(base: Alert, extra: Alert): Alert {
  const references = [...new Set([...base.references, ...extra.references])];
  const billTitles = [...new Set([...(base.billTitles ?? []), ...(extra.billTitles ?? [])])];
  const position = base.position ?? extra.position;
  return {
    ...base,
    references,
    ...(billTitles.length ? { billTitles } : {}),
    ...(position ? { position } : {}),
  };
}

export async function checkSource(
  org: Organization,
  previous?: SourceCheck,
  opts?: { useAi?: boolean },
): Promise<SourceCheck> {
  const now = new Date().toISOString();
  const useAi = opts?.useAi ?? false;
  const known = new Map(previous?.alerts.map((a) => [a.url, a]));
  const candidates = new Map<string, string>();
  let checked = previous?.checked ?? null;

  const hubUrls = [org.url, ...(org.extraHubs ?? [])];
  for (const hubUrl of hubUrls) {
    try {
      const hub = await page(hubUrl);
      if (!hub?.links.length) throw new Error("No readable directory");
      for (const link of hub.links) {
        const u = new URL(link.url);
        if (
          !permitted(u) ||
          !link.title ||
          u.href.replace(/\/$/, "") === hubUrl.replace(/\/$/, "") ||
          u.href.replace(/\/$/, "") === org.url.replace(/\/$/, "")
        ) {
          continue;
        }
        if (/^(?:give|donate)\./i.test(u.hostname) || NON_CAMPAIGN_PATH.test(u.pathname)) continue;
        if (
          INDIVIDUAL_PATH.test(u.pathname) ||
          ASK_TITLE.test(link.title) ||
          platforms.some((host) => u.hostname === host || u.hostname.endsWith("." + host))
        ) {
          if (!candidates.has(u.href) && candidates.size < 20) candidates.set(u.href, link.title);
        }
      }
      checked = now;
    } catch {
      /* Keep the previous successful check date and evidence. */
    }
  }

  if (org.name === "California State Association of Counties") {
    // The association publishes dated legislative roundups through its WordPress search endpoint.
    try {
      const response = await fetch("https://www.counties.org/wp-json/wp/v2/search?search=legislative%20session&per_page=30", {
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error("Unavailable");
      const posts: { url: string; title: string }[] = await response.json();
      for (const post of posts) {
        if (post.url.startsWith("https://www.counties.org/news-and-media-article/")) candidates.set(post.url, post.title);
      }
    } catch {
      checked = previous?.checked ?? null;
    }
  }

  const curated = campaignIssues.flatMap((i) => i.campaigns).filter((c) => c.organization === org.name);
  for (const c of curated) candidates.set(c.url, c.action);

  const alerts: Alert[] = [];
  for (const [url, title] of candidates) {
    const old = known.get(url);
    try {
      const detail = await page(url);
      if (org.name === "California State Association of Counties" && detail) {
        for (const letter of detail.letters) alerts.push({ ...letter, checked: now, state: "listed" });
        continue;
      }
      if (!detail) {
        alerts.push({
          url,
          title: (old?.title ?? title).replace(/\s+/g, " ").slice(0, 200),
          references: old?.references ?? [],
          ...(old?.billTitles?.length ? { billTitles: old.billTitles } : {}),
          ...(old?.position ? { position: old.position } : {}),
          checked: now,
          state: "unlisted",
        });
        continue;
      }
      const closed = /(?:this|the) (?:campaign|action|petition) (?:has ended|is (?:now )?closed|is no longer active)/i.test(detail.text);
      const resolvedTitle = (detail.title || title).replace(/\s+/g, " ").slice(0, 200);
      const extracted = await analyzeAlertBody(
        resolvedTitle,
        detail.text,
        detail.links.map((l) => l.url),
        org,
        old,
        useAi,
      );
      alerts.push({
        url,
        title: resolvedTitle,
        references: extracted.references,
        ...(extracted.billTitles.length ? { billTitles: extracted.billTitles } : {}),
        ...(extracted.position ? { position: extracted.position } : {}),
        checked: now,
        state: closed ? "closed" : "listed",
        textHash: extracted.textHash,
      });
    } catch {
      alerts.push({
        url,
        title: old?.title ?? title.slice(0, 200),
        references: old?.references ?? [],
        ...(old?.billTitles?.length ? { billTitles: old.billTitles } : {}),
        ...(old?.position ? { position: old.position } : {}),
        checked: old?.checked ?? null,
        state: "unverified",
        ...(old?.textHash ? { textHash: old.textHash } : {}),
      });
    }
  }

  for (const feedUrl of org.feeds ?? []) {
    try {
      const feedAlerts = await fetchFeedAlerts(feedUrl, org, known, now, useAi);
      checked = now;
      for (const fa of feedAlerts) {
        const existingIdx = alerts.findIndex((a) => a.url === fa.url);
        if (existingIdx >= 0) {
          alerts[existingIdx] = mergeAlerts(alerts[existingIdx], fa);
        } else {
          alerts.push(fa);
        }
      }
    } catch {
      /* Keep any hub results or previous evidence. */
    }
  }

  for (const old of known.values()) {
    if (!candidates.has(old.url) && !alerts.some((a) => a.url === old.url)) {
      alerts.push(checked === now && old.state !== "closed" ? { ...old, state: "unlisted" } : old);
    }
  }
  return { organization: org.name, attempted: now, checked, alerts };
}
