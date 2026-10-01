/// <reference types="vite/client" />

// mammoth ships no types for its browser bundle; only convertToHtml is used.
declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
