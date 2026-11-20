/**
 * Zero-cost fallback analysis (no LLM): keyword rules → topics. Lets the app run without an
 * API key. Items analyzed this way stay `pending`, so real analysis replaces them once a key is set.
 */
import type { Analysis } from "./analyze";

const RULES: [RegExp, string][] = [
  [/national park|\bnps\b|national monument|national recreation area|seashore/i, "public-lands/national-parks"],
  [/\bclimb(ing|ers?)?\b|\bbolting\b|\bcrags?\b|\bfixed anchors?\b/i, "public-lands/climbing-access"],
  [/\btrails?\b|\brecreation(al)?\b|\boutdoor|\bcampgrounds?\b|\bhunting\b|\bfishing\b/i, "public-lands/trails-recreation"],
  [/wilderness|conservation area|roadless/i, "public-lands/wilderness"],
  [/mining|mineral|grazing|oil and gas lease|drilling|bureau of land management|\bblm\b/i, "public-lands/extraction-on-public-land"],
  [/forest service|national forest/i, "public-lands"],
  [/climate|greenhouse|emission/i, "environment/climate"],
  [/air quality|clean air|ozone|particulate/i, "environment/air-quality"],
  [/\bwater\b|\brivers?\b|\bwetlands?\b|\bwatersheds?\b/i, "environment/water"],
  [/wildlife|endangered|threatened species|fish and wildlife|habitat|fisher(y|ies)/i, "environment/wildlife"],
  [/solar|wind energy|renewable|clean energy|electric vehicle/i, "environment/clean-energy"],
  [/\boil\b|\bnatural gas\b|\bcoal\b|\bpipelines?\b|\bpetroleum\b/i, "environment/fossil-fuels"],
  [/wildfire|fire management/i, "environment/wildfire"],
  [/\bhousing\b/i, "housing/affordability"],
  [/\btenants?\b|\brenters?\b|\beviction|\brent(al)?\b/i, "housing/renters-rights"],
  [/homeless/i, "housing/homelessness"],
  [/zoning|land use|comprehensive plan/i, "housing/zoning"],
  [/property tax/i, "housing/property-tax"],
  [/\btransit\b|\bbus(es)?\b|\blight rail\b|\brail(way|road)?s?\b/i, "transportation/transit"],
  [/\bbicycl|\bpedestrian|\bsidewalks?\b|\bbikes?\b/i, "transportation/bike-ped"],
  [/\bhighways?\b|\broads?\b|\bbridges?\b|\btraffic\b/i, "transportation/roads"],
  [/\btax(es|ation)?\b/i, "economy/taxes"],
  [/\bwages?\b|\bemployment\b|\bworkforce\b|\bjobs?\b/i, "economy/wages"],
  [/small business/i, "economy/small-business"],
  [/\bunions?\b|\bcollective bargaining\b|\blabor\b/i, "economy/labor"],
  [/\bconsumers?\b|\bfraud\b|\bscams?\b/i, "economy/consumer-protection"],
  [/health insurance|affordable care|coverage/i, "health/coverage"],
  [/medicare|medicaid/i, "health/medicare-medicaid"],
  [/drug pric|prescription/i, "health/drug-prices"],
  [/mental health|behavioral health|suicide/i, "health/mental-health"],
  [/abortion|reproductive|contracepti/i, "health/reproductive-health"],
  [/\bschools?\b|\bk-12\b|\bteachers?\b/i, "education/k12"],
  [/college|universit|student loan|higher education/i, "education/higher-ed"],
  [/child ?care|early childhood|head start/i, "education/childcare"],
  [/\bvot(e|ing|ers?)\b|\belections?\b|\bballots?\b/i, "civil-rights/voting-rights"],
  [/police|policing|law enforcement/i, "justice-safety/policing"],
  [/sentenc|incarcerat|prison|criminal justice/i, "justice-safety/criminal-justice-reform"],
  [/firearm|\bgun/i, "justice-safety/guns"],
  [/\bimmigra|\bvisas?\b|\basylum\b|\bborder\b/i, "immigration"],
  [/privacy|personal data|surveillance/i, "technology/data-privacy"],
  [/artificial intelligence|\bai\b/i, "technology/ai"],
  [/\bbroadband\b|\binternet\b/i, "technology/broadband"],
  [/\bbudget\b|\bappropriations?\b|\bbonds?\b/i, "government/budget"],
  [/social security/i, "social-safety-net/social-security"],
  [/\bsnap\b|\bfood assistance\b|\bnutrition\b/i, "social-safety-net/food-assistance"],
  [/veteran/i, "veterans-military"],
  [/\bagricultur|\bfarm(s|ers?|ing)?\b|\bcrops?\b|\blivestock\b/i, "agriculture"],
  [/\btariffs?\b|\btrade agreements?\b|\bforeign\b/i, "foreign-policy"],
];

const CEREMONIAL = /post office|designat(e|ing) the facility|commemorat|recogniz(e|ing) the|awareness (week|month|day)|honoring/i;

export function heuristicAnalysis(item: { title: string; description: string | null; agency: string | null }): Analysis {
  const text = `${item.title} ${item.description ?? ""} ${item.agency ?? ""}`;
  const topics = [...new Set(RULES.filter(([re]) => re.test(text)).map(([, t]) => t))].slice(0, 4);
  const firstSentences = (item.description ?? "").split(/(?<=\.)\s+/).slice(0, 2).join(" ");
  return {
    summary: firstSentences, // empty rather than repeating the title
    why_it_matters: "",
    topics,
    affected_groups: /\bparks?\b|\btrails?\b|\brecreation(al)?\b|\bclimb|\bwilderness\b|\bhunting\b/i.test(text) ? ["outdoor-recreationists"] : [],
    keywords: [],
    significance: CEREMONIAL.test(item.title) ? 1 : item.description ? 3 : 2,
    arguments_for: [],
    arguments_against: [],
  };
}
