// Community detail data for the Community – Student View page.
//
// There are no community tables in Supabase yet (see supabase_migrations/),
// so — same "no backend table yet" pattern as ALL_COMMUNITIES and the Home
// Community lock in DesktopDashboard.tsx — this is typed mock data keyed by
// community id. Everything the page renders comes through getCommunityDetail(),
// so wiring the real backend later means replacing that one function (and
// nothing in the UI).

// The person who runs a community. The product calls them the "WynkoHead".
export interface CommunityHead {
  name: string
  initials: string
  color: string // avatar accent, any CSS colour
}

// One block of the WynkoHead's daily study schedule. Times use the same
// "9:00 AM" format as the student's own ScheduleItem so a slot maps 1:1 onto
// it when the student accepts the schedule.
export interface CommunityScheduleSlot {
  id: string
  start: string
  end: string
  subject: string
  topic: string
}

export interface CommunityAnnouncement {
  id: string
  title: string
  message: string
  postedAt: number // epoch ms
  pinned?: boolean
  important?: boolean
}

// The signed-in student's numbers *within this community*, plus the
// community-wide averages shown on the My Progress tab.
export interface CommunityProgress {
  todayMinutes: number
  todaySessions: number
  adherencePct: number
  totalMinutes: number
  totalSessions: number
  // Last 7 days, oldest → today (same shape/order as WeeklyStudyDay).
  weeklyMinutes: number[]
  community: {
    avgDailyMinutes: number
    activeSubjects: number
    avgAdherencePct: number
  }
}

export interface CommunityDetail {
  exam: string // e.g. "JEE" — used when a schedule's subjects become study units
  head: CommunityHead
  // Fallback only: the Communities list already carries a live count for
  // most communities, and that one wins so the two screens always agree.
  studyingNow: number
  slots: CommunityScheduleSlot[]
  announcements: CommunityAnnouncement[]
  progress: CommunityProgress
}

const H = 60 * 60 * 1000
const D = 24 * H
const ago = (ms: number) => Date.now() - ms

function slot(id: string, start: string, end: string, subject: string, topic: string): CommunityScheduleSlot {
  return { id, start, end, subject, topic }
}

// Built lazily so "2 hours ago" is relative to when the page is opened,
// not to when the bundle was loaded.
function build(id: number): CommunityDetail | null {
  switch (id) {
    case 1: // JEE 2026 — Alpha Squad
      return {
        exam: 'JEE',
        head: { name: 'Kabir Mehta', initials: 'KM', color: 'linear-gradient(135deg,#7C4DFF,#4C2E9E)' },
        studyingNow: 128,
        slots: [
          slot('a1', '6:30 AM', '8:00 AM', 'Physics', 'Rotational Motion'),
          slot('a2', '4:00 PM', '5:30 PM', 'Chemistry', 'Chemical Kinetics'),
          slot('a3', '7:30 PM', '9:00 PM', 'Mathematics', 'Definite Integrals'),
        ],
        announcements: [
          { id: 'a-1', title: 'Weekly Test Schedule Released', important: true, postedAt: ago(2 * H),
            message: 'The weekly test schedule for this week is now live. Check the Schedule tab for details.' },
          { id: 'a-2', title: 'Daily Study Challenge – Day 5', postedAt: ago(5 * H),
            message: 'Keep going! You’re doing great. Don’t forget to complete today’s challenge.' },
          { id: 'a-3', title: 'Physics Doubt Session Tomorrow', postedAt: ago(8 * H),
            message: 'Join the live doubt session for Physics at 8:00 PM in the community study room.' },
          { id: 'a-4', title: 'Mock Test 3 Results Are Out', postedAt: ago(2 * D + 3 * H),
            message: 'Review your analysis and add your weak topics to this week’s revision.' },
          { id: 'a-5', title: 'Chemistry Session Moved to 4:00 PM', postedAt: ago(4 * D + 6 * H),
            message: 'The Chemistry block now starts at 4:00 PM. The Schedule tab already reflects this.' },
          { id: 'a-0', title: 'Welcome to Alpha Squad', pinned: true, postedAt: ago(21 * D),
            message: 'Follow the community schedule, join the study room when you can, and keep your streak alive.' },
        ],
        progress: {
          todayMinutes: 165, todaySessions: 2, adherencePct: 86,
          totalMinutes: 2300, totalSessions: 41,
          weeklyMinutes: [190, 240, 210, 275, 180, 150, 165],
          community: { avgDailyMinutes: 260, activeSubjects: 3, avgAdherencePct: 82 },
        },
      }
    case 2: // JEE 2026 — Warriors
      return {
        exam: 'JEE',
        head: { name: 'Ananya Iyer', initials: 'AI', color: 'linear-gradient(135deg,#EC4899,#BE185D)' },
        studyingNow: 832,
        slots: [
          slot('w1', '7:00 AM', '9:00 AM', 'Mathematics', 'PYQ Practice — Coordinate Geometry'),
          slot('w2', '4:30 PM', '6:00 PM', 'Physics', 'Electrostatics'),
          slot('w3', '8:00 PM', '9:30 PM', 'Chemistry', 'Organic Revision'),
        ],
        announcements: [
          { id: 'w-1', title: 'Full-Length Mock This Sunday', important: true, postedAt: ago(3 * H),
            message: 'Attempt it in one sitting, exam conditions. Solutions go live at 6:00 PM.' },
          { id: 'w-2', title: 'Formula Sheet Updated', postedAt: ago(1 * D + 2 * H),
            message: 'Electrostatics and Current Electricity formulas have been added.' },
          { id: 'w-0', title: 'Welcome to Warriors', pinned: true, postedAt: ago(30 * D),
            message: 'Mock-test-first community. Finish the day’s schedule before you log off.' },
        ],
        progress: {
          todayMinutes: 120, todaySessions: 1, adherencePct: 74,
          totalMinutes: 1850, totalSessions: 33,
          weeklyMinutes: [150, 210, 180, 240, 200, 90, 120],
          community: { avgDailyMinutes: 235, activeSubjects: 3, avgAdherencePct: 77 },
        },
      }
    case 3: // NEET 2026 — Dreamers
      return {
        exam: 'NEET',
        head: { name: 'Dr. Meera Nair', initials: 'MN', color: 'linear-gradient(135deg,#12B886,#0A9673)' },
        studyingNow: 521,
        slots: [
          slot('n1', '6:00 AM', '7:30 AM', 'Biology', 'Human Physiology'),
          slot('n2', '10:00 AM', '11:30 AM', 'Chemistry', 'Biomolecules'),
          slot('n3', '5:00 PM', '6:30 PM', 'Physics', 'Ray Optics'),
          slot('n4', '8:00 PM', '9:00 PM', 'Biology', 'NCERT Line-by-Line'),
        ],
        announcements: [
          { id: 'n-1', title: 'NCERT Reading Sprint', postedAt: ago(6 * H),
            message: 'Finish Chapter 18 tonight. Diagrams count — redraw them from memory.' },
          { id: 'n-2', title: 'Biology Test on Friday', important: true, postedAt: ago(1 * D + 5 * H),
            message: 'Covers Human Physiology chapters 17–21. 90 questions, 90 minutes.' },
          { id: 'n-0', title: 'Welcome to Dreamers', pinned: true, postedAt: ago(26 * D),
            message: 'Biology first, always. Stick to the schedule and revise daily.' },
        ],
        progress: {
          todayMinutes: 210, todaySessions: 3, adherencePct: 91,
          totalMinutes: 2680, totalSessions: 52,
          weeklyMinutes: [240, 255, 230, 270, 250, 200, 210],
          community: { avgDailyMinutes: 270, activeSubjects: 3, avgAdherencePct: 84 },
        },
      }
    case 4: // UPSC 2026 — Aspirants
      return {
        exam: 'UPSC',
        head: { name: 'Siddharth Rao', initials: 'SR', color: 'linear-gradient(135deg,#F59E0B,#B45309)' },
        studyingNow: 318,
        slots: [
          slot('u1', '6:00 AM', '7:00 AM', 'Current Affairs', 'Daily Newspaper Analysis'),
          slot('u2', '9:00 AM', '11:30 AM', 'Polity', 'Constitutional Bodies'),
          slot('u3', '7:00 PM', '8:00 PM', 'Answer Writing', 'One GS answer, timed'),
        ],
        announcements: [
          { id: 'u-1', title: 'Answer Writing Practice Tonight', postedAt: ago(4 * H),
            message: 'Submit one 150-word answer before the 8:00 PM block ends.' },
          { id: 'u-0', title: 'Welcome to Aspirants', pinned: true, postedAt: ago(40 * D),
            message: 'Current affairs every morning, one answer every evening. Consistency wins.' },
        ],
        progress: {
          todayMinutes: 95, todaySessions: 2, adherencePct: 68,
          totalMinutes: 1420, totalSessions: 28,
          weeklyMinutes: [130, 120, 160, 110, 140, 180, 95],
          community: { avgDailyMinutes: 210, activeSubjects: 3, avgAdherencePct: 72 },
        },
      }
    case 5: // Boards 2026 — Sprinters
      return {
        exam: 'Boards',
        head: { name: 'Neha Kapoor', initials: 'NK', color: 'linear-gradient(135deg,#19B5E6,#0F7FB8)' },
        studyingNow: 145,
        slots: [
          slot('b1', '5:30 PM', '7:00 PM', 'Mathematics', 'Sample Paper Practice'),
          slot('b2', '8:00 PM', '9:30 PM', 'Physics', 'Numericals Revision'),
        ],
        announcements: [
          { id: 'b-1', title: 'Sample Paper Set 2 Released', important: true, postedAt: ago(1 * D + 1 * H),
            message: 'Attempt it timed. Compare with the marking scheme afterwards.' },
          { id: 'b-0', title: 'Welcome to Sprinters', pinned: true, postedAt: ago(14 * D),
            message: 'Last-mile revision only. Two focused blocks a day is enough.' },
        ],
        progress: {
          todayMinutes: 90, todaySessions: 1, adherencePct: 79,
          totalMinutes: 980, totalSessions: 22,
          weeklyMinutes: [100, 110, 90, 120, 105, 80, 90],
          community: { avgDailyMinutes: 150, activeSubjects: 2, avgAdherencePct: 76 },
        },
      }
    default:
      return null
  }
}

// Returns null for a community with no detail yet — the page shows a plain
// "nothing here yet" state instead of crashing.
export function getCommunityDetail(communityId: number): CommunityDetail | null {
  return build(communityId)
}
