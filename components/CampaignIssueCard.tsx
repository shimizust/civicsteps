import { Card, Pill } from "@/components/ui";
import type { CampaignIssue } from "@/lib/campaigns";
import { topicName } from "@/lib/taxonomy";
import { stateLabel, type CampaignSnapshot } from "@/lib/advocacy";

export function CampaignIssueCard({ issue, snapshot }: { issue: CampaignIssue; snapshot: CampaignSnapshot }) {
  return (
    <Card>
      <p className="mb-1 text-xs text-muted">{topicName(issue.topics[0])} · U.S. Congress</p>
      <h3 className="font-display text-lg font-semibold">{issue.title}</h3>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
        {issue.campaigns.map((campaign) => {
          const alert = snapshot.find((s) => s.organization === campaign.organization)?.alerts.find((a) => a.url === campaign.url);
          return (
            <li key={campaign.url} className="border-t border-line pt-3">
              <p className="font-medium">{campaign.organization}</p>
              <Pill>{campaign.stance} this bill</Pill>
              <p className="my-2 text-sm text-muted">{campaign.reason}</p>
              <a className="text-sm text-accent underline" href={campaign.url} target="_blank" rel="noreferrer">
                {alert?.state === "closed" ? "Campaign closed · View source" : campaign.action} ↗
              </a>
              {alert && alert.state !== "listed" && alert.state !== "closed" && <p className="text-xs text-muted">{stateLabel[alert.state]}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
