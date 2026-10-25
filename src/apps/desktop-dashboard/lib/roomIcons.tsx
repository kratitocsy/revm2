import type { ComponentType } from 'react'
import {
  Brain, Stethoscope, Bank, Atom, Flask, Function as FunctionIcon, BookOpen, Code,
  Scales, Calculator, Translate, GraduationCap, Dna, Globe, PenNib, Trophy, Lightning,
  type IconProps,
} from '@phosphor-icons/react'

// Study-room icons. Rooms don't store an icon: it is derived from the room
// name + subject so a room looks the same everywhere. Name wins over subject,
// because official rooms (NEET UG, UPSC CSE, ...) all share "All Subjects".
export type RoomIconKey =
  | 'brain' | 'stethoscope' | 'landmark' | 'atom' | 'flask' | 'function' | 'book-open'
  | 'code' | 'scales' | 'calculator' | 'language' | 'graduation' | 'dna' | 'globe'
  | 'pen' | 'trophy' | 'zap'

const ICONS: Record<RoomIconKey, ComponentType<IconProps>> = {
  brain: Brain, stethoscope: Stethoscope, landmark: Bank, atom: Atom, flask: Flask,
  function: FunctionIcon, 'book-open': BookOpen, code: Code, scales: Scales,
  calculator: Calculator, language: Translate, graduation: GraduationCap, dna: Dna,
  globe: Globe, pen: PenNib, trophy: Trophy, zap: Lightning,
}

// First match wins. Keep specific exams above generic subjects.
const RULES: [RegExp, RoomIconKey][] = [
  [/\b(neet|aiims|mbbs|bds|medical|medicine|pg\s?neet)\b/i, 'stethoscope'],
  [/\b(upsc|ias|ips|ifs|civil services?|psc|ssc|cgl|chsl|banking|ibps|sbi|railway|rrb|defen[cs]e|nda|cds)\b/i, 'landmark'],
  [/\b(jee|iit|advanced|mains|engineering)\b/i, 'atom'],
  [/\b(clat|law|llb|judiciary)\b/i, 'scales'],
  [/\b(ca|cs|cma|commerce|accountancy|accounts?|finance|economics)\b/i, 'calculator'],
  [/\b(cat|mba|gmat|gre|ielts|toefl|english|hindi|language|grammar)\b/i, 'language'],
  [/\b(coding|programming|dsa|developer|computer|cs50|software|gate)\b/i, 'code'],
  [/\b(physics)\b/i, 'atom'],
  [/\b(chemistry)\b/i, 'flask'],
  [/\b(math|maths|mathematics|algebra|calculus)\b/i, 'function'],
  [/\b(biology|botany|zoology)\b/i, 'dna'],
  [/\b(geography|history|polity|geopolitics|current affairs|gk)\b/i, 'globe'],
  [/\b(writing|essay|literature|journalism)\b/i, 'pen'],
  [/\b(board|cbse|icse|class\s?(9|10|11|12)|school)\b/i, 'graduation'],
  [/\b(compet|battle|champ|olympiad|contest)\b/i, 'trophy'],
]

export function pickRoomIcon(name: string, subject?: string | null): RoomIconKey {
  for (const hay of [name, subject ?? '']) {
    for (const [re, key] of RULES) if (re.test(hay)) return key
  }
  return 'book-open'
}

export function RoomGlyph({ iconKey, size = 28 }: { iconKey: RoomIconKey; size?: number }) {
  const Cmp = ICONS[iconKey] ?? ICONS['book-open']
  return <Cmp size={size} weight="duotone" color="#fff" aria-hidden />
}
