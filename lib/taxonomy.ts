/**
 * Single source of truth for the topic taxonomy and affected groups.
 * `npm run gen:seed` writes these into supabase/seed.sql.
 * The AI analysis is constrained to these slugs, so changing a slug is a migration.
 */

export type Topic = { slug: string; name: string; parent?: string };

const tree: Record<string, { name: string; children: Record<string, string> }> = {
  "public-lands": {
    name: "Public Lands & Outdoors",
    children: {
      "national-parks": "National Parks",
      "climbing-access": "Climbing Access",
      "trails-recreation": "Trails & Outdoor Recreation",
      wilderness: "Wilderness & Conservation Areas",
      "extraction-on-public-land": "Mining, Drilling & Grazing on Public Land",
    },
  },
  environment: {
    name: "Environment & Energy",
    children: {
      climate: "Climate Change",
      "air-quality": "Air Quality",
      water: "Water & Rivers",
      wildlife: "Wildlife & Endangered Species",
      "clean-energy": "Clean Energy",
      "fossil-fuels": "Oil, Gas & Coal",
      wildfire: "Wildfire & Forest Management",
    },
  },
  housing: {
    name: "Housing",
    children: {
      affordability: "Housing Affordability",
      "renters-rights": "Renters' Rights",
      homelessness: "Homelessness",
      zoning: "Zoning & Land Use",
      "property-tax": "Property Tax",
    },
  },
  transportation: {
    name: "Transportation",
    children: {
      transit: "Public Transit",
      "bike-ped": "Biking & Pedestrian Safety",
      roads: "Roads & Highways",
    },
  },
  economy: {
    name: "Economy & Work",
    children: {
      taxes: "Taxes",
      wages: "Jobs & Wages",
      "small-business": "Small Business",
      labor: "Labor & Unions",
      "consumer-protection": "Consumer Protection",
    },
  },
  health: {
    name: "Health Care",
    children: {
      coverage: "Insurance & Coverage",
      "medicare-medicaid": "Medicare & Medicaid",
      "drug-prices": "Prescription Drug Prices",
      "mental-health": "Mental Health",
      "reproductive-health": "Reproductive Health",
    },
  },
  education: {
    name: "Education",
    children: {
      k12: "K-12 Schools",
      "higher-ed": "Higher Education & Student Debt",
      childcare: "Childcare & Early Education",
    },
  },
  "civil-rights": {
    name: "Civil Rights & Liberties",
    children: {
      "voting-rights": "Voting Rights",
      lgbtq: "LGBTQ+ Rights",
      "racial-justice": "Racial Justice",
      disability: "Disability Rights",
      "free-speech": "Free Speech",
    },
  },
  "justice-safety": {
    name: "Justice & Public Safety",
    children: {
      policing: "Policing",
      "criminal-justice-reform": "Criminal Justice Reform",
      guns: "Gun Policy",
      "emergency-services": "Emergency Services",
    },
  },
  immigration: { name: "Immigration", children: {} },
  technology: {
    name: "Technology",
    children: {
      "data-privacy": "Data Privacy",
      ai: "Artificial Intelligence",
      broadband: "Broadband & Internet Access",
    },
  },
  government: {
    name: "Government & Democracy",
    children: {
      elections: "Elections & Campaign Finance",
      budget: "Government Budget & Spending",
      transparency: "Government Transparency & Ethics",
    },
  },
  "social-safety-net": {
    name: "Social Safety Net",
    children: {
      "social-security": "Social Security",
      "food-assistance": "Food Assistance",
      "paid-leave": "Paid Leave & Family Support",
    },
  },
  "veterans-military": { name: "Veterans & Military", children: {} },
  agriculture: { name: "Agriculture & Food", children: {} },
  "foreign-policy": { name: "Foreign Policy & Trade", children: {} },
};

export const TOPICS: Topic[] = Object.entries(tree).flatMap(([slug, { name, children }]) => [
  { slug, name },
  ...Object.entries(children).map(([child, childName]) => ({
    slug: `${slug}/${child}`,
    name: childName,
    parent: slug,
  })),
]);

export const TOPIC_SLUGS = new Set(TOPICS.map((t) => t.slug));

export const topicName = (slug: string) => TOPICS.find((t) => t.slug === slug)?.name ?? slug;

/** A topic matches itself and its parent ("public-lands/climbing-access" also counts as "public-lands"). */
export function expandTopics(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const s of slugs) {
    out.add(s);
    const parent = TOPICS.find((t) => t.slug === s)?.parent;
    if (parent) out.add(parent);
  }
  return [...out];
}

export const AFFECTED_GROUPS = {
  renters: "Renters",
  homeowners: "Homeowners",
  "low-income": "Low-income households",
  "middle-income": "Middle-income households",
  "high-income": "High-income households",
  students: "Students",
  parents: "Parents",
  seniors: "Seniors",
  veterans: "Veterans",
  "small-business-owners": "Small business owners",
  "hourly-workers": "Hourly workers",
  "union-members": "Union members",
  "healthcare-workers": "Healthcare workers",
  teachers: "Teachers",
  "tech-workers": "Tech workers",
  farmers: "Farmers & ranchers",
  "rural-residents": "Rural residents",
  "urban-residents": "Urban residents",
  "people-with-disabilities": "People with disabilities",
  immigrants: "Immigrants",
  "outdoor-recreationists": "Outdoor recreationists",
  "transit-riders": "Transit riders",
  drivers: "Drivers",
  "medicare-beneficiaries": "Medicare beneficiaries",
  "medicaid-beneficiaries": "Medicaid beneficiaries",
  uninsured: "Uninsured people",
} as const;

export type AffectedGroup = keyof typeof AFFECTED_GROUPS;
export const AFFECTED_GROUP_SLUGS = Object.keys(AFFECTED_GROUPS) as AffectedGroup[];

/** Optional, coarse profile answers. Every field is skippable. */
export type Demographics = {
  housing?: "rent" | "own" | "other";
  income?: "low" | "middle" | "high";
  age?: "18-24" | "25-44" | "45-64" | "65+";
  student?: boolean;
  parent?: boolean;
  veteran?: boolean;
  disability?: boolean;
  immigrant?: boolean;
  area?: "urban" | "suburban" | "rural";
  commute?: "transit" | "drive" | "bike-walk" | "remote";
  coverage?: "employer" | "marketplace" | "medicare" | "medicaid" | "uninsured";
  work?: "hourly" | "small-business" | "healthcare" | "teacher" | "tech" | "farm" | "union" | "other";
  outdoors?: boolean;
};

export function groupsForDemographics(d: Demographics): AffectedGroup[] {
  const g = new Set<AffectedGroup>();
  if (d.housing === "rent") g.add("renters");
  if (d.housing === "own") g.add("homeowners");
  if (d.income) g.add(`${d.income}-income` as AffectedGroup);
  if (d.age === "65+") g.add("seniors");
  if (d.student) g.add("students");
  if (d.parent) g.add("parents");
  if (d.veteran) g.add("veterans");
  if (d.disability) g.add("people-with-disabilities");
  if (d.immigrant) g.add("immigrants");
  if (d.area === "rural") g.add("rural-residents");
  if (d.area === "urban") g.add("urban-residents");
  if (d.commute === "transit") g.add("transit-riders");
  if (d.commute === "drive") g.add("drivers");
  if (d.coverage === "medicare") g.add("medicare-beneficiaries");
  if (d.coverage === "medicaid") g.add("medicaid-beneficiaries");
  if (d.coverage === "uninsured") g.add("uninsured");
  const work: Partial<Record<NonNullable<Demographics["work"]>, AffectedGroup>> = {
    hourly: "hourly-workers",
    "small-business": "small-business-owners",
    healthcare: "healthcare-workers",
    teacher: "teachers",
    tech: "tech-workers",
    farm: "farmers",
    union: "union-members",
  };
  if (d.work && work[d.work]) g.add(work[d.work]!);
  if (d.outdoors) g.add("outdoor-recreationists");
  return [...g];
}
