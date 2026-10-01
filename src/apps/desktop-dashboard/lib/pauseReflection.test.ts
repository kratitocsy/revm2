import { describe, it, expect } from 'vitest';
import { PAUSE_REFLECTION_MIN_CHARS, countReflectionChars, isPauseUnlocked } from './pauseReflection';

describe('pause reflection barrier', () => {
  it('needs 150 characters', () => {
    expect(PAUSE_REFLECTION_MIN_CHARS).toBe(150);
    expect(isPauseUnlocked('a'.repeat(149))).toBe(false);
    expect(isPauseUnlocked('a'.repeat(150))).toBe(true);
  });

  it('accepts gibberish, punctuation and accented characters', () => {
    const gibberish = 'qwzx!!..ññ42'.repeat(13); // 12 characters x 13 = 156
    expect(countReflectionChars(gibberish)).toBe(156);
    expect(isPauseUnlocked(gibberish)).toBe(true);
  });

  it('does not count spaces, line breaks or blank input', () => {
    expect(countReflectionChars('')).toBe(0);
    expect(countReflectionChars('   \n\t ')).toBe(0);
    expect(countReflectionChars('  ab   c\n\nd  ')).toBe(4);
    expect(isPauseUnlocked(`${' '.repeat(500)}${'a'.repeat(149)}${'\n'.repeat(500)}`)).toBe(false);
  });
});
