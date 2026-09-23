import type { Archetype, QuestionId } from '../_shared/quizEngine';
import { line, type Expression, type Line } from './wynky';

// Intro lines are user-provided and must stay verbatim. Everything else is draft copy.
// Each line's first argument is its audio-file id (/audio/wynky/{lang}/{id}.mp3 — see wynky.tsx's speak()).
export const INTRO = line(
  'intro',
  'hey guys I am wynkiee do you want to play game with me',
  'Hello fraaands mein hu wynkiee aapki cute cute si dost  kya aap mere saath ye game khelenge issey mein aapki study identity pata lagaungi',
  'हेलो फ्रैंड्स! मैं हूँ विंकी, आपकी क्यूट क्यूट सी दोस्त। क्या आप मेरे साथ ये गेम खेलेंगे? इससे मैं आपकी स्टडी आइडेंटिटी पता लगाऊँगी!',
);

export const REACTIONS: { line: Line; expr: Expression }[] = [
  { line: line('reaction_1', 'Ooh, nice pick!', 'Ooh, badhiya choice!', 'ऊह, बढ़िया चॉइस!'), expr: 'happy' },
  { line: line('reaction_2', 'Noted! You are doing great.', 'Noted! Aap toh kamaal kar rahe ho.', 'नोटेड! आप तो कमाल कर रहे हो।'), expr: 'wink' },
  { line: line('reaction_3', 'Hehe, I knew it!', 'Hehe, mujhe pata tha!', 'हेहे, मुझे पता था!'), expr: 'happy' },
  { line: line('reaction_4', 'Love that energy!', 'Kya energy hai yaar!', 'क्या एनर्जी है यार!'), expr: 'wink' },
];

// Question audio ids are the question id itself (q1..q7, q6b).
export const QUESTION_COPY: Record<QuestionId, { ask: Line; expr: Expression }> = {
  q1: { expr: 'curious', ask: line('q1', 'First up — which exam are we cracking?', 'Sabse pehle batao, kaunsa exam crack karna hai?', 'सबसे पहले बताओ, कौनसा एग्ज़ाम क्रैक करना है?') },
  q2: { expr: 'curious', ask: line('q2', 'And where are you in the journey?', 'Aur aap abhi kis stage pe ho?', 'और आप अभी किस स्टेज पे हो?') },
  q3: { expr: 'curious', ask: line('q3', 'What does your day look like?', 'Aapka din kaisa jaata hai?', 'आपका दिन कैसा जाता है?') },
  q4: { expr: 'curious', ask: line('q4', 'When does your brain work best?', 'Aapka dimaag sabse zyada kab chalta hai?', 'आपका दिमाग सबसे ज़्यादा कब चलता है?') },
  q5: { expr: 'curious', ask: line('q5', 'How many hours can you study in a day?', 'Din mein kitne ghante padh lete ho?', 'दिन में कितने घंटे पढ़ लेते हो?') },
  q6: { expr: 'wink', ask: line('q6', 'Be honest… what distracts you the most?', 'Sach sach batana… sabse zyada kya distract karta hai?', 'सच सच बताना… सबसे ज़्यादा क्या डिस्ट्रैक्ट करता है?') },
  q6b: { expr: 'wink', ask: line('q6b', 'Really? Nothing at all? Should I block social anyway?', 'Sach mein? Kuch bhi nahi? Social block kar doon phir bhi?', 'सच में? कुछ भी नहीं? सोशल ब्लॉक कर दूँ फिर भी?') },
  q7: { expr: 'curious', ask: line('q7', 'Last one! How do you learn best?', 'Last question! Aap sabse achha kaise seekhte ho?', 'लास्ट क्वेश्चन! आप सबसे अच्छा कैसे सीखते हो?') },
};

export const SAVING = line('saving', 'Hmm, let me figure you out…', 'Hmm, ek second, main soch rahi hoon…', 'हम्म, एक सेकंड, मैं सोच रही हूँ…');

export const SAVE_FAILED = line(
  'save_failed',
  "Oops, I couldn't save that. Let's try again!",
  'Oops, save nahi hua. Ek baar phir try karte hain!',
  'ऊप्स, सेव नहीं हुआ। एक बार फिर ट्राई करते हैं!',
);

// One audio id per archetype (result_dawn-warrior, result_night-owl, ...) since the line's text depends on it.
const archetypeSlug = (arch: Archetype) => arch.toLowerCase().replace(/\s+/g, '-');

export const resultLine = (arch: Archetype): Line =>
  line(`result_${archetypeSlug(arch)}`, `You are a ${arch}! Welcome to Wynko.`, `Aap ho ek ${arch}! Wynko mein swagat hai.`, `आप हो एक ${arch}! विंको में स्वागत है।`);
