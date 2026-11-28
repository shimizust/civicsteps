import { expandTopics, topicParent } from "./taxonomy";

export type CampaignIssue = {
  title: string;
  topics: string[];
  congressIds: string[];
  campaigns: {
    organization: string;
    stance: "Supports" | "Opposes";
    reason: string;
    action: string;
    url: string;
  }[];
};

export const campaignIssues: CampaignIssue[] = [
  {
    title: "Family Stability and Opportunity Vouchers Act",
    topics: ["housing/affordability", "housing/homelessness"],
    congressIds: ["119-S-5405", "119-HR-10688"],
    campaigns: [{
      organization: "National Low Income Housing Coalition",
      stance: "Supports",
      reason: "The coalition wants more families with young children to be able to use rental vouchers in neighborhoods with good schools and job opportunities.",
      action: "Find the coalition’s letter to Congress",
      url: "https://nlihc.org/resource/take-action-tell-congress-enact-bipartisan-family-stability-and-opportunity-vouchers-act",
    }],
  },
  {
    title: "SAVE America Act",
    topics: ["civil-rights/voting-rights", "government/elections"],
    congressIds: ["119-HR-7296"],
    campaigns: [
      {
        organization: "American Civil Liberties Union",
        stance: "Opposes",
        reason: "The ACLU argues that the documentation requirements would keep eligible citizens from registering and voting.",
        action: "Write to Congress with the ACLU",
        url: "https://action.aclu.org/send-message/stop-anti-voter-bills-now/",
      },
      {
        organization: "Heritage Action for America",
        stance: "Supports",
        reason: "Heritage Action argues that requiring citizenship documents at registration and photo ID at the polls would strengthen election safeguards.",
        action: "Find your senator and a call script",
        url: "https://heritageaction.com/action/save-our-elections",
      },
    ],
  },
];

export function campaignsForItem(source: string, externalId: string, topics: string[]) {
  const expanded = expandTopics(topics);
  const direct = campaignIssues.filter((issue) => source === "congress" && issue.congressIds.includes(externalId));
  const related = campaignIssues.filter(
    (issue) =>
      !direct.includes(issue) &&
      issue.topics.some((topic) => expanded.includes(topic) || expanded.includes(topicParent(topic))),
  );
  return { direct, related };
}
