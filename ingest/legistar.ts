/** City council legislation and members from the Legistar Web API (no key) for cities in legistar.config.ts. */
import type { OfficialRow } from "@/lib/civic/officials";
import { getJson, truncate, type NormalizedItem } from "./normalize";
import type { LocalSource } from "./legistar.config";

type Matter = {
  MatterId: number;
  MatterGuid: string;
  MatterFile: string | null;
  MatterName: string | null;
  MatterTitle: string | null;
  MatterTypeName: string | null;
  MatterStatusName: string | null;
  MatterBodyName: string | null;
  MatterIntroDate: string | null;
  MatterAgendaDate: string | null;
  MatterLastModifiedUtc: string;
};

type OfficeRecord = {
  OfficeRecordPersonId: number;
  OfficeRecordFullName: string;
  OfficeRecordTitle: string | null;
  OfficeRecordEmail: string | null;
  OfficeRecordBodyName: string;
};

// Administrative records that aren't decisions residents weigh in on.
const SKIP_TYPES = /appointment|clerk file|information item|minutes|communication|proclamation/i;

const legistarDate = (d: Date) => `datetime'${d.toISOString().slice(0, 19)}'`;

export function normalizeMatter(m: Matter, src: LocalSource, now = new Date()): NormalizedItem | null {
  if (m.MatterTypeName && SKIP_TYPES.test(m.MatterTypeName)) return null;
  const text = m.MatterTitle ?? m.MatterName ?? "";
  if (!text) return null;
  // Legistar dates carry no timezone; treat the agenda date as a calendar day (noon UTC) so it
  // doesn't shift with the server's timezone.
  const agendaDate = m.MatterAgendaDate ? new Date(`${m.MatterAgendaDate.slice(0, 10)}T12:00:00Z`) : null;
  const upcoming = agendaDate && agendaDate.getTime() >= now.getTime() - 86_400_000 ? agendaDate : null;
  const url = `https://${src.client}.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}`;
  return {
    source: "legistar",
    external_id: `${src.client}:${m.MatterId}`,
    type: "agenda_item",
    level: "city",
    jurisdiction_id: src.jurisdictionId,
    state: src.state,
    title: truncate(`${m.MatterFile ? m.MatterFile + ": " : ""}${text}`, 300),
    description: text.length > 280 ? truncate(text, 6000) : null,
    url,
    action_url: url,
    agency: m.MatterBodyName ? `${src.name} ${m.MatterBodyName}` : `${src.name} City Council`,
    status: m.MatterStatusName,
    introduced_at: m.MatterIntroDate?.slice(0, 10) ?? null,
    last_action_at: m.MatterLastModifiedUtc.slice(0, 10),
    last_action: m.MatterStatusName,
    comment_deadline: null,
    event_at: upcoming ? upcoming.toISOString() : null,
  };
}

export function councilMemberFromRecord(r: OfficeRecord, src: LocalSource): OfficialRow {
  const title = r.OfficeRecordTitle && r.OfficeRecordTitle !== "Member" ? `Council ${r.OfficeRecordTitle}` : "City Councilmember";
  return {
    id: `legistar:${src.client}:${r.OfficeRecordPersonId}`,
    name: r.OfficeRecordFullName,
    party: null,
    office: `${src.name} ${title}`,
    level: "city",
    jurisdiction_id: src.jurisdictionId,
    state: src.state,
    photo_url: null,
    contacts: { emails: r.OfficeRecordEmail ? [r.OfficeRecordEmail] : [], website: `https://${src.client}.legistar.com/People.aspx` },
    external_ids: { legistar_person: r.OfficeRecordPersonId },
    updated_at: new Date().toISOString(),
  };
}

const base = (src: LocalSource) => `https://webapi.legistar.com/v1/${src.client}`;

export async function fetchCityMatters(src: LocalSource, since: Date, top = 300): Promise<NormalizedItem[]> {
  const u = new URL(`${base(src)}/matters`);
  u.searchParams.set("$filter", `MatterLastModifiedUtc ge ${legistarDate(since)}`);
  u.searchParams.set("$orderby", "MatterLastModifiedUtc desc");
  u.searchParams.set("$top", String(top));
  const matters = await getJson<Matter[]>(u);
  return matters.map((m) => normalizeMatter(m, src)).filter((x): x is NormalizedItem => !!x);
}

export async function fetchCouncilMembers(src: LocalSource): Promise<OfficialRow[]> {
  const u = new URL(`${base(src)}/officerecords`);
  u.searchParams.set("$filter", `OfficeRecordStartDate le ${legistarDate(new Date())} and OfficeRecordEndDate ge ${legistarDate(new Date())} and OfficeRecordBodyName eq 'City Council'`);
  const records = await getJson<OfficeRecord[]>(u);
  const seen = new Set<number>();
  return records
    .filter((r) => r.OfficeRecordBodyName === "City Council" && !seen.has(r.OfficeRecordPersonId) && seen.add(r.OfficeRecordPersonId))
    .map((r) => councilMemberFromRecord(r, src));
}
