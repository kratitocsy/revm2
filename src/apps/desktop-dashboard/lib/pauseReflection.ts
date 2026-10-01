// Focus Lock's pause barrier: pausing a running timer first requires typing
// at least PAUSE_REFLECTION_MIN_CHARS characters in the "Before you pause…"
// dialog. Any characters count - gibberish included - it's a speed bump, not
// an essay. Spaces and line breaks don't count, so holding the space bar
// doesn't get you through. The text only ever lives in the dialog's own
// state: it is never saved or sent anywhere, and it's discarded when the
// dialog closes.
export const PAUSE_REFLECTION_MIN_CHARS = 150;

/** Characters typed, not counting spaces, tabs or line breaks. */
export function countReflectionChars(text: string): number {
  return Array.from(text.replace(/\s/g, '')).length;
}

export function isPauseUnlocked(text: string): boolean {
  return countReflectionChars(text) >= PAUSE_REFLECTION_MIN_CHARS;
}
