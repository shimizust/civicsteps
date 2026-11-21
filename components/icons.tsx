import {
  Briefcase, Bus, Coins, Cpu, Earth, FileText, Globe, GraduationCap, HandHeart, HeartPulse, House, Landmark,
  Leaf, Medal, Mountain, Scale, Shield, ShieldCheck, Users, Wallet, Wheat, type LucideIcon,
} from "lucide-react";

/** Icon names used in lib/taxonomy.ts (FACETS, TOPIC_ART), kept as strings there so the taxonomy stays UI-free. */
const ICONS: Record<string, LucideIcon> = {
  Briefcase, Bus, Coins, Cpu, Earth, FileText, Globe, GraduationCap, HandHeart, HeartPulse, House, Landmark,
  Leaf, Medal, Mountain, Scale, Shield, ShieldCheck, Users, Wallet, Wheat,
};

export function Icon({ name, className, ...rest }: { name: string; className?: string; "aria-hidden"?: boolean }) {
  const C = ICONS[name] ?? FileText;
  return <C className={className} aria-hidden {...rest} />;
}
