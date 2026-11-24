/* ============================================================
   edunitiPyqs.ts

   Data + pure logic for the "Eduniti Top PYQs" page.

   Content credit: question sets, selection and answer keys are by Mohit
   Goenka (Eduniti, IIT Kharagpur alumnus), used in Wynko with his
   permission. Each question is the picture cut from his PDF (they
   contain diagrams and formulas, so they stay images), and the answer
   key is typed in from the PDF's own answer key.

   Adding a set: put the question pictures in
   assets/eduniti/<set-folder>/qNNN.webp, then add a PyqSet below.
   ============================================================ */

export type PyqKind = 'mcq' | 'num'

export interface PyqQuestion {
  n: number
  chapter: string
  /** 'mcq': pick option 1-4. 'num': type a number. */
  kind: PyqKind
  /** Option number (1-4) for 'mcq', the numeric answer for 'num'. */
  answer: number
  /** JEE Main dropped this topic from the syllabus from 2024. */
  removed?: boolean
  note?: string
}

export interface PyqSet {
  id: string
  title: string
  subtitle: string
  credit: string
  /** Video solutions for the set, when known. */
  solutionUrl: string | null
  /** URL prefix of the question pictures. */
  imageBase: string
  /** Picture URL per question number, for sets imported on this device. */
  images?: Record<number, string>
  /** Imported by the student from their own PDF (kept on this device). */
  uploaded?: boolean
  questions: PyqQuestion[]
}

const CHAPTERS_2023 = [
  "Units, Dimensions, Errors & Vectors",
  "Kinematics",
  "Laws of Motion",
  "Work, Power, Energy & Circular Motion",
  "COM & Collision",
  "Rotational Motion",
  "Gravitation",
  "Simple Harmonic Motion",
  "Properties of Solids",
  "Fluid Mechanics",
  "Thermal Properties",
  "KTG & Thermodynamics",
  "Wave Motion",
  "Electrostatics",
  "Capacitors",
  "Current Electricity",
  "Moving Charges, MEC & Magnetism",
  "Electromagnetic Induction",
  "Alternating Current",
  "Ray Optics",
  "Wave Optics",
  "EM Waves",
  "Semiconductors",
  "Modern Physics",
]

function q(n: number, chapterIdx: number, kind: PyqKind, answer: number, extra: Partial<PyqQuestion> = {}): PyqQuestion {
  return { n, chapter: CHAPTERS_2023[chapterIdx], kind, answer, ...extra }
}

export const JEE_MAIN_2023_TOP_200: PyqSet = {
  id: 'jee-main-2023-top-200',
  title: 'JEE Main 2023 Physics: Top 200',
  subtitle: "The 200 best questions out of 720 asked in JEE Main 2023 (Jan and April attempts), picked by Mohit Goenka.",
  credit: 'Mohit Goenka, Founder of Eduniti, IIT Kharagpur alumnus',
  solutionUrl: 'https://youtu.be/i5FAg5Nmito',
  imageBase: '/assets/eduniti/jee-main-2023/',
  questions: [
  q(1, 0, 'mcq', 4),
  q(2, 0, 'num', 4),
  q(3, 0, 'num', 41),
  q(4, 0, 'num', 220),
  q(5, 0, 'mcq', 3),
  q(6, 0, 'mcq', 1),
  q(7, 0, 'mcq', 1),
  q(8, 0, 'mcq', 1),
  q(9, 1, 'num', 200),
  q(10, 1, 'num', 120),
  q(11, 1, 'num', 50),
  q(12, 1, 'mcq', 1),
  q(13, 1, 'num', 80),
  q(14, 1, 'mcq', 3),
  q(15, 1, 'mcq', 4),
  q(16, 2, 'mcq', 1),
  q(17, 2, 'mcq', 4),
  q(18, 3, 'num', 50),
  q(19, 3, 'num', 100),
  q(20, 3, 'num', 2),
  q(21, 3, 'num', 300),
  q(22, 3, 'num', 40),
  q(23, 3, 'num', 4),
  q(24, 3, 'num', 2),
  q(25, 3, 'mcq', 4),
  q(26, 3, 'num', -245, {note: "NTA gave 245; the Eduniti key notes it should be -245."}),
  q(27, 3, 'mcq', 4),
  q(28, 4, 'mcq', 4),
  q(29, 4, 'mcq', 4),
  q(30, 4, 'mcq', 2),
  q(31, 5, 'num', 2),
  q(32, 5, 'mcq', 3),
  q(33, 5, 'num', 800),
  q(34, 5, 'num', 3),
  q(35, 5, 'num', 54),
  q(36, 5, 'num', 75),
  q(37, 5, 'num', 16),
  q(38, 5, 'mcq', 1),
  q(39, 5, 'num', 4),
  q(40, 6, 'mcq', 1),
  q(41, 6, 'mcq', 2),
  q(42, 6, 'mcq', 2),
  q(43, 6, 'mcq', 4),
  q(44, 6, 'mcq', 3),
  q(45, 6, 'mcq', 3),
  q(46, 7, 'num', 2),
  q(47, 7, 'num', 8),
  q(48, 7, 'num', 20),
  q(49, 7, 'mcq', 1),
  q(50, 7, 'mcq', 4),
  q(51, 7, 'num', 4),
  q(52, 8, 'mcq', 3),
  q(53, 8, 'mcq', 1),
  q(54, 8, 'mcq', 4),
  q(55, 8, 'num', 20),
  q(56, 8, 'num', 2),
  q(57, 8, 'num', 40),
  q(58, 9, 'num', 2),
  q(59, 9, 'mcq', 3),
  q(60, 9, 'mcq', 4),
  q(61, 9, 'mcq', 1),
  q(62, 9, 'num', 10),
  q(63, 9, 'mcq', 1),
  q(64, 9, 'num', 1150),
  q(65, 10, 'mcq', 2),
  q(66, 10, 'mcq', 1),
  q(67, 10, 'mcq', 1, {removed: true}),
  q(68, 10, 'num', 40),
  q(69, 11, 'mcq', 4),
  q(70, 11, 'mcq', 4, {removed: true}),
  q(71, 11, 'mcq', 1),
  q(72, 11, 'mcq', 4),
  q(73, 11, 'mcq', 1),
  q(74, 11, 'mcq', 4),
  q(75, 11, 'mcq', 1),
  q(76, 11, 'mcq', 2),
  q(77, 12, 'mcq', 2, {removed: true}),
  q(78, 12, 'mcq', 4),
  q(79, 12, 'num', 200),
  q(80, 12, 'num', 420, {removed: true}),
  q(81, 12, 'num', 80),
  q(82, 12, 'num', 500),
  q(83, 12, 'num', 90),
  q(84, 13, 'num', 288),
  q(85, 13, 'num', 2),
  q(86, 13, 'num', 45),
  q(87, 13, 'num', 24),
  q(88, 13, 'mcq', 4),
  q(89, 13, 'num', 12),
  q(90, 13, 'mcq', 3),
  q(91, 13, 'num', 5),
  q(92, 13, 'num', 8),
  q(93, 13, 'num', 300),
  q(94, 13, 'num', 6),
  q(95, 14, 'num', 225),
  q(96, 14, 'num', 55),
  q(97, 14, 'num', 5),
  q(98, 14, 'mcq', 3),
  q(99, 14, 'mcq', 3),
  q(100, 14, 'num', 75),
  q(101, 15, 'num', 25, {removed: true}),
  q(102, 15, 'num', 2),
  q(103, 15, 'num', 1),
  q(104, 15, 'num', 2),
  q(105, 15, 'num', 2),
  q(106, 15, 'mcq', 1),
  q(107, 15, 'mcq', 1),
  q(108, 15, 'num', 20),
  q(109, 15, 'num', 125),
  q(110, 15, 'num', 1),
  q(111, 15, 'mcq', 4),
  q(112, 15, 'num', 15),
  q(113, 15, 'num', 50),
  q(114, 15, 'mcq', 3),
  q(115, 16, 'num', 144),
  q(116, 16, 'mcq', 1),
  q(117, 16, 'mcq', 2),
  q(118, 16, 'num', 68),
  q(119, 16, 'mcq', 4),
  q(120, 16, 'num', 40),
  q(121, 16, 'mcq', 1),
  q(122, 16, 'mcq', 1),
  q(123, 16, 'num', 2),
  q(124, 16, 'num', 40),
  q(125, 17, 'mcq', 3),
  q(126, 17, 'mcq', 2),
  q(127, 17, 'mcq', 4),
  q(128, 17, 'num', 30),
  q(129, 17, 'num', 44),
  q(130, 17, 'num', 8),
  q(131, 17, 'num', 50),
  q(132, 17, 'num', 25),
  q(133, 17, 'num', 60),
  q(134, 17, 'mcq', 4),
  q(135, 17, 'num', 88),
  q(136, 18, 'num', 40),
  q(137, 18, 'num', 10, {removed: true}),
  q(138, 18, 'mcq', 2),
  q(139, 18, 'num', 240),
  q(140, 18, 'mcq', 3),
  q(141, 19, 'num', 120),
  q(142, 19, 'num', 52),
  q(143, 19, 'num', 30),
  q(144, 19, 'mcq', 4),
  q(145, 19, 'num', 32),
  q(146, 19, 'mcq', 1),
  q(147, 19, 'num', 50),
  q(148, 19, 'mcq', 3),
  q(149, 19, 'num', 18),
  q(150, 19, 'mcq', 2),
  q(151, 19, 'num', 98),
  q(152, 19, 'mcq', 2),
  q(153, 19, 'num', 3),
  q(154, 20, 'num', 4),
  q(155, 20, 'mcq', 2),
  q(156, 20, 'mcq', 3),
  q(157, 20, 'num', 24),
  q(158, 20, 'num', 10),
  q(159, 20, 'num', 3),
  q(160, 20, 'num', 462),
  q(161, 20, 'num', 30),
  q(162, 21, 'mcq', 2),
  q(163, 21, 'num', 5),
  q(164, 21, 'mcq', 2),
  q(165, 22, 'mcq', 2),
  q(166, 22, 'mcq', 4),
  q(167, 22, 'mcq', 4),
  q(168, 22, 'mcq', 2),
  q(169, 22, 'mcq', 4),
  q(170, 22, 'mcq', 4),
  q(171, 23, 'num', 828),
  q(172, 23, 'num', 6),
  q(173, 23, 'num', 27),
  q(174, 23, 'num', 4),
  q(175, 23, 'num', 2),
  q(176, 23, 'mcq', 4),
  q(177, 23, 'mcq', 1, {removed: true}),
  q(178, 23, 'mcq', 2),
  q(179, 23, 'num', 4),
  q(180, 23, 'num', 300, {removed: true}),
  q(181, 23, 'mcq', 4),
  q(182, 23, 'mcq', 2),
  q(183, 23, 'mcq', 2),
  q(184, 23, 'mcq', 1),
  q(185, 23, 'num', 121),
  q(186, 23, 'mcq', 1),
  q(187, 23, 'mcq', 3),
  q(188, 23, 'mcq', 4),
  q(189, 23, 'mcq', 3, {removed: true}),
  q(190, 23, 'num', 4),
  q(191, 23, 'mcq', 4),
  q(192, 23, 'num', 2),
  q(193, 23, 'num', 4125),
  q(194, 23, 'num', 5),
  q(195, 23, 'mcq', 3),
  q(196, 23, 'num', 16),
  q(197, 23, 'mcq', 1),
  q(198, 23, 'num', 3),
  q(199, 23, 'num', 2),
  q(200, 23, 'mcq', 2),
  ],
}

export const PYQ_SETS: PyqSet[] = [JEE_MAIN_2023_TOP_200]

export function questionImageUrl(set: PyqSet, n: number): string {
  if (set.images) return set.images[n] ?? ''
  return `${set.imageBase}q${String(n).padStart(3, '0')}.webp`
}

export function chaptersOf(set: PyqSet): string[] {
  const seen: string[] = []
  for (const x of set.questions) if (!seen.includes(x.chapter)) seen.push(x.chapter)
  return seen
}

export type CheckResult = 'correct' | 'wrong' | 'invalid'

/** Parses what a student typed for a numeric answer. Accepts "245", "-245", " 2.5 ", "1,150". */
export function parseNumeric(input: string): number | null {
  const t = input.trim().replace(/,/g, '')
  if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** Checks a response: for 'mcq' it is the option number as a string ("1".."4"), for 'num' the typed number. */
export function checkAnswer(question: PyqQuestion, response: string): CheckResult {
  if (question.kind === 'mcq') {
    if (!/^[1-4]$/.test(response)) return 'invalid'
    return Number(response) === question.answer ? 'correct' : 'wrong'
  }
  const v = parseNumeric(response)
  if (v === null) return 'invalid'
  return Math.abs(v - question.answer) < 1e-9 ? 'correct' : 'wrong'
}

/* Progress: what the student has attempted, kept on this device. */
export type PyqProgress = Record<number, { response: string; correct: boolean }>

const progressKey = (setId: string) => `wynko.pyq.${setId}`

export function loadProgress(setId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): PyqProgress {
  try {
    const raw = storage?.getItem(progressKey(setId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: PyqProgress = {}
    for (const [k, v] of Object.entries(parsed as Record<string, any>)) {
      if (v && typeof v.response === 'string' && typeof v.correct === 'boolean') out[Number(k)] = { response: v.response, correct: v.correct }
    }
    return out
  } catch {
    return {}
  }
}

export function saveProgress(setId: string, progress: PyqProgress, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(progressKey(setId), JSON.stringify(progress)) } catch { /* storage blocked or full: progress just isn't kept */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function summarize(set: PyqSet, progress: PyqProgress) {
  let attempted = 0, correct = 0
  for (const x of set.questions) {
    const p = progress[x.n]
    if (p) { attempted++; if (p.correct) correct++ }
  }
  return { total: set.questions.length, attempted, correct }
}
