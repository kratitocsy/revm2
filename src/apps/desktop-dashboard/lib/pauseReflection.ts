// Focus Lock's pause barrier: pausing a running timer first requires typing
// at least PAUSE_REFLECTION_MIN_WORDS words in the "Before you pause…" dialog.
// Any words count - gibberish included - it's a speed bump, not an essay.
// The text only ever lives in the dialog's own state: it is never saved or
// sent anywhere, and it's discarded when the dialog closes.
export const PAUSE_REFLECTION_MIN_WORDS = 150;

/** Whitespace-separated words; any run of non-space characters is a word. */
export function countReflectionWords(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

export function isPauseUnlocked(text: string): boolean {
  return countReflectionWords(text) >= PAUSE_REFLECTION_MIN_WORDS;
}
