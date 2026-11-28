import Link from "next/link";
import { PageTitle, Card, SectionTitle } from "@/components/ui";
import { CampaignIssueCard } from "@/components/CampaignIssueCard";
import { campaignIssues } from "@/lib/campaigns";
import { organizations, organizationsForTopic, reviewDate, stateLabel } from "@/lib/advocacy";
import { getCampaignData } from "@/lib/campaignData";
import { createClient } from "@/lib/supabase/server";
import { TOPICS, topicName } from "@/lib/taxonomy";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const requested = (await searchParams).topic;
  const topic = TOPICS.find((t) => t.slug === requested);
  const groups = topic ? organizationsForTopic(topic.slug) : organizations;
  const { snapshot, audit } = await getCampaignData(await createClient());
  const issues = campaignIssues.filter((i) => !topic || i.topics.some((t) => t === topic.slug || t.startsWith(topic.slug + "/")));
  return (
    <div>
      <Link href="/browse" className="text-sm text-muted hover:text-accent">← Browse civic items</Link>
      <div className="mt-4">
        <PageTitle sub="Find organizations working on an issue and see what they ask people to do.">
          Advocacy campaigns
        </PageTitle>
      </div>
      <form className="flex flex-wrap items-end gap-2" action="/campaigns">
        <label className="grid gap-1 text-sm">Issue
          <select name="topic" defaultValue={topic?.slug ?? ""} className="rounded-lg border border-line bg-card p-2">
            <option value="">All issues</option>
            {TOPICS.map((t) => <option key={t.slug} value={t.slug}>{t.parent && "　"}{t.name}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-accent px-4 py-2 text-sm text-white">Show organizations</button>
      </form>
      {!!issues.length && <SectionTitle>Positions on specific bills</SectionTitle>}
      <div className="space-y-3">{issues.map((i) => <CampaignIssueCard key={i.title} issue={i} snapshot={snapshot} />)}</div>
      <SectionTitle hint={String(groups.length)}>Organizations{topic && " · " + topic.name}</SectionTitle>
      {audit && <p className="mb-3 text-sm text-muted">On {reviewDate(audit.date)}, the index checked {audit.checked.toLocaleString()} items and found campaigns or published positions for {audit.matched.toLocaleString()}.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((org) => {
          const source = snapshot.find((s) => s.organization === org.name);
          return (
            <Card key={org.url}>
              <h3 className="font-semibold"><a className="text-accent hover:underline" href={org.url} target="_blank" rel="noreferrer">{org.name} ↗</a></h3>
              <p className="mt-1 text-sm">{org.topics.map(topicName).join(" · ")}</p>
              <p className="mt-2 text-xs text-muted">{source?.checked ? "Directory checked " + reviewDate(source.checked) : "Directory check pending"}
                {source && source.attempted !== source.checked && " · Latest attempt unavailable"}
              </p>
              {!!source?.alerts.length && <details className="mt-2 text-sm">
                <summary className="cursor-pointer">Campaigns and positions ({source.alerts.length})</summary>
                <ul className="mt-2 space-y-2">
                  {source.alerts.map((a) => <li key={a.url}><a className="text-accent underline" href={a.url} target="_blank" rel="noreferrer">{a.title}</a><span className="block text-xs text-muted">{stateLabel[a.state]}</span></li>)}
                </ul>
              </details>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
