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

/**
 * The onboarding "About you" questions. Every one is optional; a skipped one is asked again later, one at a time,
 * when an item in the user's feed depends on it (see GROUP_DEMOGRAPHIC and lib/impact.ts).
 */
export type DemographicQuestion = { key: keyof Demographics; label: string; ask: string } & (
  | { kind: "choice"; options: [string, string][] }
  | { kind: "bool" }
);

export const DEMOGRAPHIC_QUESTIONS: DemographicQuestion[] = [
  { key: "housing", label: "Do you rent or own your home?", ask: "Do you rent or own your home?", kind: "choice", options: [["rent", "Rent"], ["own", "Own"], ["other", "Other"]] },
  { key: "income", label: "Household income", ask: "Roughly, what's your household income?", kind: "choice", options: [["low", "Under $50k"], ["middle", "$50k–$150k"], ["high", "Over $150k"]] },
  { key: "age", label: "Age", ask: "How old are you?", kind: "choice", options: [["18-24", "18–24"], ["25-44", "25–44"], ["45-64", "45–64"], ["65+", "65+"]] },
  { key: "area", label: "Where you live", ask: "Is where you live urban, suburban or rural?", kind: "choice", options: [["urban", "Urban"], ["suburban", "Suburban"], ["rural", "Rural"]] },
  { key: "commute", label: "How you mostly get around", ask: "How do you mostly get around?", kind: "choice", options: [["transit", "Transit"], ["drive", "Drive"], ["bike-walk", "Bike / walk"], ["remote", "Work from home"]] },
  { key: "coverage", label: "Health coverage", ask: "Where does your health coverage come from?", kind: "choice", options: [["employer", "Employer"], ["marketplace", "Marketplace"], ["medicare", "Medicare"], ["medicaid", "Medicaid"], ["uninsured", "Uninsured"]] },
  { key: "work", label: "Work", ask: "What kind of work do you do?", kind: "choice", options: [["hourly", "Hourly"], ["small-business", "Small business owner"], ["healthcare", "Healthcare"], ["teacher", "Education"], ["tech", "Tech"], ["farm", "Farming / ranching"], ["union", "Union member"], ["other", "Other"]] },
  { key: "student", label: "Student", ask: "Are you a student?", kind: "bool" },
  { key: "parent", label: "Parent or guardian", ask: "Are you a parent or guardian?", kind: "bool" },
  { key: "veteran", label: "Veteran", ask: "Are you a veteran?", kind: "bool" },
  { key: "disability", label: "Living with a disability", ask: "Are you living with a disability?", kind: "bool" },
  { key: "immigrant", label: "Immigrant", ask: "Are you an immigrant?", kind: "bool" },
  { key: "outdoors", label: "Spend a lot of time outdoors (hiking, climbing, fishing…)", ask: "Do you spend a lot of time outdoors (hiking, climbing, fishing…)?", kind: "bool" },
];

/**
 * Which onboarding question decides whether the user is in a group. Disability and immigration status are
 * deliberately absent: we only learn those if the user volunteers them in onboarding, never by prompting later.
 */
export const GROUP_DEMOGRAPHIC: Partial<Record<AffectedGroup, keyof Demographics>> = {
  renters: "housing",
  homeowners: "housing",
  "low-income": "income",
  "middle-income": "income",
  "high-income": "income",
  students: "student",
  parents: "parent",
  seniors: "age",
  veterans: "veteran",
  "small-business-owners": "work",
  "hourly-workers": "work",
  "union-members": "work",
  "healthcare-workers": "work",
  teachers: "work",
  "tech-workers": "work",
  farmers: "work",
  "rural-residents": "area",
  "urban-residents": "area",
  "outdoor-recreationists": "outdoors",
  "transit-riders": "commute",
  drivers: "commute",
  "medicare-beneficiaries": "coverage",
  "medicaid-beneficiaries": "coverage",
  uninsured: "coverage",
};

/** Keeps only known keys with allowed values. Bool answers may arrive as "yes"/"no". */
export function cleanDemographics(input: Record<string, unknown>): Demographics {
  const out: Record<string, string | boolean> = {};
  for (const q of DEMOGRAPHIC_QUESTIONS) {
    const v = input[q.key];
    if (v === undefined || v === null) continue;
    if (q.kind === "bool") {
      if (typeof v === "boolean") out[q.key] = v;
      else if (v === "yes" || v === "no") out[q.key] = v === "yes";
    } else if (typeof v === "string" && q.options.some(([o]) => o === v)) {
      out[q.key] = v;
    }
  }
  return out as Demographics;
}

// ---------------------------------------------------------------- life facets ("how this affects you")

/** Fixed areas of life an item can touch. The AI scores each item once; personalization is plain TS (lib/impact.ts). */
export const FACETS = {
  wallet: { label: "Wallet", icon: "Wallet", description: "Taxes, fees, prices, wages and benefits" },
  health: { label: "Health", icon: "HeartPulse", description: "Care, coverage, public health" },
  home: { label: "Home", icon: "House", description: "Rent, ownership, your neighborhood" },
  family: { label: "Family", icon: "Users", description: "Kids, parents, caregiving" },
  work: { label: "Work", icon: "Briefcase", description: "Jobs, workplace rules, your business" },
  education: { label: "Education", icon: "GraduationCap", description: "Schools, college, training" },
  mobility: { label: "Getting around", icon: "Bus", description: "Transit, roads, biking and walking" },
  safety: { label: "Safety", icon: "ShieldCheck", description: "Policing, emergencies, crime" },
  environment: { label: "Outdoors & environment", icon: "Mountain", description: "Parks, public land, air, water, climate" },
  rights: { label: "Rights & values", icon: "Scale", description: "Liberties, conscience, fairness, how government works" },
} as const;

export type Facet = keyof typeof FACETS;
export const FACET_SLUGS = Object.keys(FACETS) as Facet[];

/** Profile groups that make a facet personally relevant. */
export const FACET_GROUPS: Record<Facet, AffectedGroup[]> = {
  wallet: ["low-income", "middle-income", "high-income", "homeowners", "small-business-owners"],
  health: ["medicare-beneficiaries", "medicaid-beneficiaries", "uninsured", "healthcare-workers", "people-with-disabilities", "seniors"],
  home: ["renters", "homeowners"],
  family: ["parents", "seniors"],
  work: ["hourly-workers", "union-members", "small-business-owners", "tech-workers", "teachers", "farmers", "healthcare-workers"],
  education: ["students", "parents", "teachers"],
  mobility: ["transit-riders", "drivers"],
  safety: ["urban-residents", "rural-residents"],
  environment: ["outdoor-recreationists", "farmers", "rural-residents"],
  rights: ["immigrants", "people-with-disabilities"],
};

const TOPIC_FACETS: Record<string, Facet[]> = {
  "public-lands": ["environment"],
  environment: ["environment", "health"],
  "environment/clean-energy": ["environment", "wallet"],
  "environment/fossil-fuels": ["environment", "wallet"],
  housing: ["home", "wallet"],
  "housing/zoning": ["home"],
  transportation: ["mobility"],
  economy: ["wallet", "work"],
  "economy/taxes": ["wallet"],
  "economy/consumer-protection": ["wallet"],
  health: ["health", "wallet"],
  "health/mental-health": ["health"],
  "health/reproductive-health": ["health", "rights"],
  education: ["education", "family"],
  "education/higher-ed": ["education", "wallet"],
  "education/childcare": ["family", "wallet"],
  "civil-rights": ["rights"],
  "justice-safety": ["safety", "rights"],
  "justice-safety/emergency-services": ["safety"],
  immigration: ["rights", "family"],
  technology: ["rights"],
  "technology/broadband": ["education", "work"],
  "technology/ai": ["work", "rights"],
  government: ["rights"],
  "government/budget": ["wallet"],
  "social-safety-net": ["wallet", "family"],
  "social-safety-net/paid-leave": ["family", "work"],
  "veterans-military": ["wallet", "health"],
  agriculture: ["work", "wallet"],
  "foreign-policy": ["wallet"],
};

/** Facets a topic touches: the child's own mapping if it has one, otherwise its parent's. */
export function facetsForTopic(slug: string): Facet[] {
  return TOPIC_FACETS[slug] ?? TOPIC_FACETS[topicParent(slug)] ?? [];
}

/** Visual identity per top-level topic: a lucide icon name and an OKLCH hue for the tile. */
export const TOPIC_ART: Record<string, { icon: string; hue: number }> = {
  "public-lands": { icon: "Mountain", hue: 150 },
  environment: { icon: "Leaf", hue: 135 },
  housing: { icon: "House", hue: 60 },
  transportation: { icon: "Bus", hue: 235 },
  economy: { icon: "Coins", hue: 85 },
  health: { icon: "HeartPulse", hue: 15 },
  education: { icon: "GraduationCap", hue: 270 },
  "civil-rights": { icon: "Scale", hue: 300 },
  "justice-safety": { icon: "Shield", hue: 215 },
  immigration: { icon: "Globe", hue: 195 },
  technology: { icon: "Cpu", hue: 255 },
  government: { icon: "Landmark", hue: 35 },
  "social-safety-net": { icon: "HandHeart", hue: 345 },
  "veterans-military": { icon: "Medal", hue: 25 },
  agriculture: { icon: "Wheat", hue: 75 },
  "foreign-policy": { icon: "Earth", hue: 205 },
};

export function topicParent(slug: string): string {
  return TOPICS.find((t) => t.slug === slug)?.parent ?? slug.split("/")[0];
}
