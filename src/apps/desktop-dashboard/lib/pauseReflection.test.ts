import { describe, it, expect } from 'vitest';
import { PAUSE_REFLECTION_MIN_WORDS, countReflectionWords, isPauseUnlocked } from './pauseReflection';

const words = (n: number, w = 'asdf') => Array.from({ length: n }, () => w).join(' ');

describe('pause reflection barrier', () => {
  it('needs 150 words', () => {
    expect(PAUSE_REFLECTION_MIN_WORDS).toBe(150);
    expect(isPauseUnlocked(words(149))).toBe(false);
    expect(isPauseUnlocked(words(150))).toBe(true);
  });

  it('accepts gibberish, punctuation and mixed whitespace as words', () => {
    const gibberish = Array.from({ length: 150 }, (_, i) => (i % 3 === 0 ? 'qwzx!!' : i % 3 === 1 ? '..' : 'ññ42')).join('\n \t');
    expect(countReflectionWords(gibberish)).toBe(150);
    expect(isPauseUnlocked(gibberish)).toBe(true);
  });

  it('does not count blank input or extra spaces', () => {
    expect(countReflectionWords('')).toBe(0);
    expect(countReflectionWords('   \n\t ')).toBe(0);
    expect(countReflectionWords('  one   two\n\nthree  ')).toBe(3);
    expect(isPauseUnlocked(`   ${words(149)}      `)).toBe(false);
  });
});
