import {
  Award, BookOpen, Briefcase, Bus, Coins, Cpu, Earth, FilePenLine, FileText, Flame, Globe, GraduationCap,
  HandHeart, HeartPulse, House, Landmark, Leaf, Medal, Megaphone, Mountain, Scale, Shield, ShieldCheck,
  Users, Wallet, Wheat, type LucideIcon,
} from "lucide-react";

/** Icon names used in lib/taxonomy.ts (FACETS, TOPIC_ART) and badges, kept as strings there so domain logic stays UI-free. */
const ICONS: Record<string, LucideIcon> = {
  Award, BookOpen, Briefcase, Bus, Coins, Cpu, Earth, FilePenLine, FileText, Flame, Globe, GraduationCap,
  HandHeart, HeartPulse, House, Landmark, Leaf, Medal, Megaphone, Mountain, Scale, Shield, ShieldCheck,
  Users, Wallet, Wheat,
};

export function Icon({ name, className, ...rest }: { name: string; className?: string; "aria-hidden"?: boolean }) {
  const C = ICONS[name] ?? FileText;
  return <C className={className} aria-hidden {...rest} />;
}
