import { load } from "cheerio";
import { campaignIssues } from "../lib/campaigns";
import { organizations, referenceKey, type Alert, type SourceCheck } from "../lib/advocacy";

const platforms = ["actionnetwork.org", "votervoice.net", "p2a.co", "quorum.us", "everyaction.com", "engagingnetworks.app", "salsalabs.org"];
const orgDomains = organizations.map((o) => new URL(o.url).hostname.replace(/^www\./, ""));
const allowed = [...orgDomains, ...platforms, "aclu.org", "eff.org"];
function permitted(u: URL) {
  return u.protocol === "https:" && !u.username && !u.password && !u.port &&
    allowed.some((domain) => u.hostname === domain || u.hostname.endsWith("." + domain));
}

async function page(url: string) {
  let u = new URL(url);
  for (let redirect = 0; redirect <= 4 && permitted(u); redirect++) {
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "CivicSteps campaign directory/1.0" } });
    if ([404, 410].includes(r.status)) { await r.body?.cancel(); return null; }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      u = new URL(r.headers.get("location")!, u);
      await r.body?.cancel();
      continue;
    }
    if (!r.ok || !r.headers.get("content-type")?.includes("html")) { await r.body?.cancel(); throw new Error("Unavailable"); }
    const $ = load(await r.text());
    if (/access denied|just a moment|attention required|page not found/i.test($("title").text())) throw new Error("Unavailable");
    $("header, nav, footer, script, style, aside").remove();
    const main = $("main, [role=main]").first();
    const body = main.length ? main : $("body");
    const links = body.find("a[href]").toArray().flatMap((a) => {
      try {
        const link = new URL($(a).attr("href")!, u);
        link.hash = "";
        for (const key of [...link.searchParams.keys()]) {
          if (/^utm_|^refcode$/.test(key)) link.searchParams.delete(key);
        }
        return [{ url: link.href, title: $(a).text().trim().replace(/\s+/g, " ") }];
      } catch { return []; }
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
        letters.push({ url: u.href + "#:~:text=" + encodeURIComponent(bill), position,
          title: position + " " + bill + " · Published position", references: [ref] });
      }
    }
    return { links, letters, title: $("h1").first().text().trim() || $("title").text().trim(), text: body.text() };
  }
  throw new Error("Unverified redirect");
}

export async function checkSource(org: typeof organizations[number], previous?: SourceCheck): Promise<SourceCheck> {
  const now = new Date().toISOString();
  const known = new Map(previous?.alerts.map((a) => [a.url, a]));
  const candidates = new Map<string, string>();
  let checked = previous?.checked ?? null;
  try {
    const hub = await page(org.url);
    if (!hub?.links.length) throw new Error("No readable directory");
    for (const link of hub.links) {
      const u = new URL(link.url);
      if (!permitted(u) || !link.title || u.href.replace(/\/$/, "") === org.url.replace(/\/$/, "")) continue;
      if (/^(?:give|donate)\./i.test(u.hostname) || /donat(?:e|ion)/i.test(u.pathname)) continue;
      const individual = /\/(?:bill|legislation|our-priorities|action-alerts?|send-message|petitions?|campaigns?|actions?)\/[^/]+/i.test(u.pathname);
      const ask = /^(?:email |tell |urge |ask (?:your|congress)|sign (?:our|the) petition|contact your |take action (?:to|on) )/i.test(link.title);
      if (individual || ask || platforms.some((host) => u.hostname === host || u.hostname.endsWith("." + host))) {
        if (!candidates.has(u.href)) candidates.set(u.href, link.title);
      }
    }
    checked = now;
  } catch { /* Keep the previous successful check date and evidence. */ }
  if (org.name === "California State Association of Counties") {
    // The association publishes dated legislative roundups through its WordPress search endpoint.
    try {
      const response = await fetch("https://www.counties.org/wp-json/wp/v2/search?search=legislative%20session&per_page=30", { signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error("Unavailable");
      const posts: { url: string; title: string }[] = await response.json();
      for (const post of posts) {
        if (post.url.startsWith("https://www.counties.org/news-and-media-article/")) candidates.set(post.url, post.title);
      }
    } catch { checked = previous?.checked ?? null; }
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
      const closed = detail && /(?:this|the) (?:campaign|action|petition) (?:has ended|is (?:now )?closed|is no longer active)/i.test(detail.text);
      const references = detail ? [...new Set(detail.links.map((l) => referenceKey(l.url)).filter((k): k is string => !!k))] : old?.references ?? [];
      alerts.push({ url, title: (detail?.title || title).replace(/\s+/g, " ").slice(0, 200), references, checked: now, state: !detail ? "unlisted" : closed ? "closed" : "listed" });
    } catch {
      alerts.push({ url, title: old?.title ?? title.slice(0, 200), references: old?.references ?? [], checked: old?.checked ?? null, state: "unverified" });
    }
  }
  for (const old of known.values()) {
    if (!candidates.has(old.url) && !alerts.some((a) => a.url === old.url)) alerts.push(checked === now && old.state !== "closed" ? { ...old, state: "unlisted" } : old);
  }
  return { organization: org.name, attempted: now, checked, alerts };
}
