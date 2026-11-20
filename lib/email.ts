/** Email rendering + sending via Resend's REST API. Without RESEND_API_KEY, logs instead of sending. */
import type { Ranked } from "@/lib/relevance";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function itemRow(r: Ranked) {
  const when =
    r.daysLeft !== null && r.daysLeft >= 0
      ? `<span style="color:#b4530b;font-weight:600">${r.item.comment_deadline ? "Comments close" : "On the agenda"} ${r.daysLeft === 0 ? "today" : r.daysLeft === 1 ? "tomorrow" : `in ${r.daysLeft} days`}</span><br>`
      : "";
  return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2ded3">
    ${when}<a href="${site()}/items/${r.item.id}" style="color:#1c2321;font-weight:600;text-decoration:none">${esc(r.item.title)}</a>
    ${r.analysis.summary ? `<p style="margin:4px 0 0;color:#5d6763;font-size:14px">${esc(r.analysis.summary.slice(0, 280))}</p>` : ""}
  </td></tr>`;
}

export function renderEmail(opts: { heading: string; intro: string; items: Ranked[] }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ee;font-family:system-ui,sans-serif;color:#1c2321">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
  <table width="100%" style="max-width:560px;background:#fff;border:1px solid #e2ded3;border-radius:12px;padding:24px">
    <tr><td><p style="margin:0;font-family:Georgia,serif;font-size:18px;font-weight:600">Civic<span style="color:#0f5b4f">Steps</span></p>
    <h1 style="font-family:Georgia,serif;font-size:24px;margin:16px 0 8px">${esc(opts.heading)}</h1>
    <p style="margin:0 0 8px;color:#5d6763">${esc(opts.intro)}</p></td></tr>
    ${opts.items.map(itemRow).join("")}
    <tr><td style="padding-top:20px"><a href="${site()}/feed" style="background:#0f5b4f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open my feed</a>
    <p style="margin-top:24px;font-size:12px;color:#5d6763">You get this because of your CivicSteps alert settings. <a href="${site()}/onboarding?step=5" style="color:#5d6763">Change or turn off emails</a>.</p></td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email dry-run] to=${to.replace(/(.).*@/, "$1***@")} subject="${subject}"`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "CivicSteps <alerts@example.org>", to, subject, html }),
  });
  if (!res.ok) console.error(`email to user failed: ${res.status} ${await res.text()}`);
  return res.ok;
}
