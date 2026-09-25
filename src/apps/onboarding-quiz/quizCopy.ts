import type { Archetype, QuestionId } from '../_shared/quizEngine';
import { line, type Expression, type Line } from './wynky';

// Intro lines are user-provided and must stay verbatim. Everything else is draft copy.
// Each line's first argument is its audio-file id (/audio/wynky/{lang}/{id}.mp3 — see wynky.tsx's speak()).
export const INTRO = line(
  'intro',
  'hey guys I am wynkiee do you want to play game with me',
  'Hello friendss mein hu wynkiee aapki cute cute si dost, kya aap mere saath ye game khelenge? Issey mein aapki study identity pata lagaungi',
  'हेलो फ्रैंड्स! मैं हूँ विंकी, आपकी क्यूट क्यूट सी दोस्त। क्या आप मेरे साथ ये गेम खेलेंगे? इससे मैं आपकी स्टडी आइडेंटिटी पता लगाऊँगी!',
);

export const REACTIONS: { line: Line; expr: Expression }[] = [
  { line: line('reaction_1', 'Ooh, nice pick!', 'Ooh, badhiya choice!', 'ऊह, बढ़िया चॉइस!'), expr: 'happy' },
  { line: line('reaction_2', 'Noted! You are doing great.', 'Noted! Aap toh kamaal kar rahe ho.', 'नोटेड! आप तो कमाल कर रहे हो।'), expr: 'wink' },
  { line: line('reaction_3', 'Hehe, I knew it!', 'Hehe, mujhe pata tha!', 'हेहे, मुझे पता था!'), expr: 'happy' },
  { line: line('reaction_4', 'Love that energy!', 'Kya energy hai yaar!', 'क्या एनर्जी है यार!'), expr: 'wink' },
];

// Questions: English text as written for the quiz (with its emoji); the
// Hindi text is Wynky's line, verbatim. Voice lines leave the emoji out.
// Question audio ids are the question id itself (q1..q5).
const ask = (id: QuestionId, enText: string, hiText: string, hiSay: string): Line => ({
  id,
  en: { text: enText, say: enText.replace(/\s*\p{Extended_Pictographic}\uFE0F?\s*$/u, '') },
  hi: { text: hiText, say: hiSay },
});

export const QUESTION_COPY: Record<QuestionId, { ask: Line; expr: Expression }> = {
  q1: { expr: 'curious', ask: ask('q1', 'What does your typical day look like? 📅', 'Tumhara din kaisa guzarta hai?', 'तुम्हारा दिन कैसा गुज़रता है?') },
  q2: { expr: 'curious', ask: ask('q2', 'How many hours can you study daily? ⏱️', 'Roz kitne ghante padhne ka target rakhein?', 'रोज़ कितने घंटे पढ़ने का टारगेट रखें?') },
  q3: { expr: 'wink', ask: ask('q3', "What's your biggest distraction? 📱", 'Padhai ke beech sabse bada villain kaun hai?', 'पढ़ाई के बीच सबसे बड़ा विलेन कौन है?') },
  q4: { expr: 'curious', ask: ask('q4', 'How do you prefer to study? 🧠', 'Tumhe kis tarah padhna sabse zyada pasand hai?', 'तुम्हें किस तरह पढ़ना सबसे ज़्यादा पसंद है?') },
  q5: { expr: 'wink', ask: ask('q5', "What's your biggest study challenge? 🎯", 'Sach batao, padhai mein sabse badi problem kya hai?', 'सच बताओ, पढ़ाई में सबसे बड़ी प्रॉब्लम क्या है?') },
};

export const SAVING = line('saving', 'Hmm, let me figure you out…', 'Hmm, ek second, main soch rahi hoon…', 'हम्म, एक सेकंड, मैं सोच रही हूँ…');

export const SAVE_FAILED = line(
  'save_failed',
  "Oops, I couldn't save that. Let's try again!",
  'Oops, save nahi hua. Ek baar phir try karte hain!',
  'ऊप्स, सेव नहीं हुआ। एक बार फिर ट्राई करते हैं!',
);

// One audio id per archetype (result_focus-seeker, result_team-player, ...) since the line's text depends on it.
const archetypeSlug = (arch: Archetype) => arch.toLowerCase().replace(/\s+/g, '-');

export const resultLine = (arch: Archetype): Line =>
  line(`result_${archetypeSlug(arch)}`, `You are a ${arch}! Welcome to Wynko.`, `Aap ho ek ${arch}! Wynko mein swagat hai.`, `आप हो एक ${arch}! विंको में स्वागत है।`);

export const SKIPPED_QUESTION = line('skip_question', 'No problem, next one!', 'Koi baat nahi, agla sawaal!', 'कोई बात नहीं, अगला सवाल!');

export const PROFILE_AFTER_SKIP = line(
  'profile_skip',
  "No problem! Just tell me a little about you.",
  'Koi baat nahi! Bas apne baare mein thoda batao.',
  'कोई बात नहीं! बस अपने बारे में थोड़ा बताओ।',
);

// Hindi (Hinglish) labels for the answer options, keyed "<question id>:<value>".
// English labels come from quizEngine.ts; anything missing here falls back to them.
export const OPTION_LABELS_HI: Record<string, string> = {
  'q1:school_coaching': '🏫 School + Coaching',
  'q1:school_college': '📚 School / College',
  'q1:self_study': '🏠 Pura din self-study',
  'q1:working': '💼 Job ke saath padhai',
  'q1:custom': '✨ Kuch aur (khud likho)',
  'q2:1-2': '🌱 1–2 ghante',
  'q2:2-4': '📖 2–4 ghante',
  'q2:4-6': '🔥 4–6 ghante',
  'q2:6-8': '🚀 6–8 ghante',
  'q2:custom': '✨ Kuch aur (apna target likho)',
  'q3:instagram': '📸 Instagram / Reels',
  'q3:youtube': '▶️ YouTube / Shorts',
  'q3:whatsapp': '💬 WhatsApp / Social Media',
  'q3:procrastination': '😴 Kal karenge wali aadat',
  'q3:custom': '✨ Kuch aur (khud likho)',
  'q4:videos': '🎥 Video lectures',
  'q4:books': '📚 Books aur notes',
  'q4:practice': '✍️ Practice questions',
  'q4:friends': '👥 Doston ke saath padhna',
  'q4:custom': '✨ Kuch aur (khud likho)',
  'q5:timetable': '📅 Timetable follow karna',
  'q5:consistency': '🔥 Roz consistent rehna',
  'q5:revision': '🧠 Yaad rakhna aur revise karna',
  'q5:syllabus': '📚 Syllabus complete karna',
  'q5:custom': '✨ Kuch aur (khud likho)',
};
