// Small inline icons shared by the voice bar and the room tiles.
export function VIcon({ d, off, cls = 'w-4 h-4' }: { d: React.ReactNode; off?: boolean; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}
export const MIC = <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></>
export const HEADPHONES = <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>
export const MOON = <path d="M21 13.5A8.5 8.5 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z" />
export const HAND = <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4a1.5 1.5 0 0 1 3 0v6" /><path d="M14 10V5.5a1.5 1.5 0 0 1 3 0V13" /><path d="M8 13l-1.6-2.2a1.5 1.5 0 0 0-2.4 1.8L7 18a6 6 0 0 0 5 3h1a6 6 0 0 0 6-6v-2" /></>
export const GEAR = <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>
export const BELL = <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>
export const LEAVE = <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>
