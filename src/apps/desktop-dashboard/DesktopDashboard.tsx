import { useState, useRef, useEffect, createContext, useContext } from 'react'
import libraryBg from './imports/Screenshot_2026_0908_032315.png'
import aiAssistantImg from './imports/ai-assistant.png'
import trophyBronze from './imports/trophy-bronze.png'
import trophySilver from './imports/trophy-silver.png'
import trophyGold from './imports/trophy-gold.png'
import trophyDiamond from './imports/trophy-diamond.png'
import wynkoLogo from './imports/wynko-logo.png'
import avatar7 from './imports/avatar-7.png'
import avatar8 from './imports/avatar-8.png'
import avatar9 from './imports/avatar-9.png'
import avatar10 from './imports/avatar-10.png'
import avatar11 from './imports/avatar-11.png'
import avatar12 from './imports/avatar-12.png'
import { useHomeData, type TodayFocus, type ProfileInfo } from './lib/useHomeData'
import { useFocusSession } from '../_shared/useFocusSession'
import type { ReviewItem, MultiRecallCurveData } from '../_shared/wynkoTracker'

// ─── Avatar picker ──────────────────────────────────────────────────────────────
// A real uploaded photo (profile.avatarUrl) always wins - this picker of 6
// illustrated presets is only the default/fallback identity, picked in
// Settings > Profile. Context (rather than threading yet another prop
// through every page) because nearly every page's header needs it, and
// App Root already seeds it from the real profile once that loads.
const AVATAR_OPTIONS = [avatar7, avatar8, avatar9, avatar10, avatar11, avatar12]
const UserAvatarCtx = createContext<{ avatar: string; setAvatar: (a: string) => void }>({ avatar: avatar7, setAvatar: () => {} })
function UserAvatar({ size = 32, className = '' }: { size?: number; className?: string }) {
  const { avatar } = useContext(UserAvatarCtx)
  return (
    <div className={`rounded-full overflow-hidden flex-shrink-0 ${className}`}
      style={{ width: size, height: size, border: '1.5px solid rgba(124,77,255,0.45)', boxShadow: '0 0 14px rgba(124,77,255,0.35)' }}>
      <img src={avatar} alt="You" className="w-full h-full object-cover" />
    </div>
  )
}

// ─── Icon System ──────────────────────────────────────────────────────────────
const IP: Record<string, string[]> = {
  home: ['M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25'],
  lock: ['M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z'],
  wave: ['M2 12L4.5 7L7 14.5L9.5 5.5L12 16L14.5 8.5L17 13.5L19 8L21.5 12'],
  rooms: ['M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z'],
  library: ['M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'],
  progress: ['M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'],
  cog: ['M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  search: ['M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z'],
  bell: ['M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0'],
  chevR: ['M8.25 4.5l7.5 7.5-7.5 7.5'],
  chevL: ['M15.75 19.5L8.25 12l7.5-7.5'],
  fire: ['M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.624a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.457z'],
  clock: ['M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z'],
  check: ['M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  video: ['M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z'],
  cube: ['M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9'],
  arrow: ['M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3'],
  play: ['M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z'],
  zap: ['M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z'],
  expand: ['M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15'],
  compress: ['M9 9L3.75 3.75M9 9H4.5M9 9V4.5M15 9l5.25-5.25M15 9h4.5M15 9V4.5M9 15l-5.25 5.25M9 15H4.5M9 15v4.5M15 15l5.25 5.25M15 15h4.5M15 15v4.5'],
  target: ['M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'],
  coin: ['M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
}

function Ico({ n, cls = 'w-4 h-4', style }: { n: keyof typeof IP; cls?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cls} style={style}>
      {IP[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudyUnit { subject: string; exam: string; topics: string[] }

// ─── Recall Curve SVG ─────────────────────────────────────────────────────────
// Same visual design as before (gradients, glow filter, grid, TODAY marker,
// review dots, dashed projection) but now draws one line per active topic
// (buildMultiRecallCurve — real Ebbinghaus math per topic, shared "days
// relative to today" axis) instead of a single hardcoded path. The
// most-at-risk topic keeps the original purple→cyan glow treatment;
// other topics get their own color and a name+% label at today's dot.
const SERIES_COLORS = ['#F472B6', '#FBBF24', '#34D399', '#818CF8', '#FB923C']

function RecallCurve({ data }: { data: MultiRecallCurveData | null }) {
  const W = 760, H = 180

  if (!data || data.series.length === 0) {
    return (
      <svg viewBox="0 0 760 200" className="w-full h-full">
        <text x="380" y="100" textAnchor="middle" fontSize="10" fill="rgba(148,163,184,0.4)" fontFamily="JetBrains Mono, monospace">
          No review history yet — add a topic to see its recall curve
        </text>
      </svg>
    )
  }

  const { series, minDay, maxDay } = data
  const x = (day: number) => ((day - minDay) / (maxDay - minDay)) * W
  const y = (pct: number) => (1 - pct / 100) * H
  const toPath = (pts: { day: number; retention: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.day).toFixed(1)},${y(p.retention).toFixed(1)}`).join(' ')

  const primary = series[0]
  const primarySolid = toPath(primary.points)
  const primaryProjected = toPath(primary.projected)
  const primaryArea = `${primarySolid} L ${x(0).toFixed(1)},${H} L ${x(primary.points[0].day).toFixed(1)},${H} Z`

  const tickSpan = maxDay - minDay
  const tickStep = Math.max(1, Math.round(tickSpan / 6))
  const dayTicks: number[] = []
  for (let d = Math.ceil(minDay / tickStep) * tickStep; d <= maxDay; d += tickStep) dayTicks.push(d)

  return (
    <svg viewBox="0 0 760 200" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rcLine" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7C4DFF" /><stop offset="100%" stopColor="#19B5E6" /></linearGradient>
        <linearGradient id="rcArea" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#7C4DFF" stopOpacity="0.22" /><stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" /></linearGradient>
        <filter id="rcGlow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="dotGlow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {[0, 25, 50, 75, 100].map(pct => { const gy = y(pct); return (<g key={pct}><line x1="0" y1={gy} x2={W} y2={gy} stroke="rgba(124,77,255,0.07)" strokeWidth="1" /><text x="6" y={gy - 3} fontSize="8" fill="rgba(148,163,184,0.4)" fontFamily="JetBrains Mono, monospace">{pct}%</text></g>) })}
      {dayTicks.map(day => { const gx = x(day); return (<g key={day}><line x1={gx} y1="0" x2={gx} y2={H + 2} stroke="rgba(124,77,255,0.06)" strokeWidth="1" /><text x={gx} y="196" fontSize="8" fill="rgba(148,163,184,0.35)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{day === 0 ? 'd0' : day > 0 ? `+${day}d` : `${day}d`}</text></g>) })}

      {/* Primary (most-at-risk) line: original glow treatment + area fill + R1/R2/R3 labels */}
      <path d={primaryArea} fill="url(#rcArea)" />
      <path d={primarySolid} fill="none" stroke="url(#rcLine)" strokeWidth="2.5" filter="url(#rcGlow)" />
      <path d={primaryProjected} fill="none" stroke="#F59E0B" strokeWidth="1.75" strokeDasharray="5,4" opacity="0.7" />
      {primary.reviewMarkers.map(({ day, retention, label }) => (
        <g key={label}>
          <circle cx={x(day)} cy={y(retention)} r="4" fill="#19B5E6" opacity="0.85" filter="url(#dotGlow)" />
          <text x={x(day)} y={y(retention) - 9} fontSize="7.5" fill="rgba(25,181,230,0.65)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{label}</text>
        </g>
      ))}

      {/* Secondary lines: own color, thinner, no glow, dot + name/% label at today */}
      {series.slice(1).map((s, i) => {
        const color = SERIES_COLORS[i % SERIES_COLORS.length]
        return (
          <g key={s.key}>
            <path d={toPath(s.points)} fill="none" stroke={color} strokeWidth="1.75" opacity="0.85" />
            <path d={toPath(s.projected)} fill="none" stroke={color} strokeWidth="1.25" strokeDasharray="4,4" opacity="0.4" />
            {s.reviewMarkers.map((m) => (<circle key={m.day} cx={x(m.day)} cy={y(m.retention)} r="2.5" fill={color} opacity="0.7" />))}
            <circle cx={x(0)} cy={y(s.todayRetention)} r="3" fill={color} />
            <text x={x(0) + 6} y={y(s.todayRetention) + 3} fontSize="7.5" fill={color} fillOpacity="0.9" fontFamily="JetBrains Mono, monospace">{s.topic} {Math.round(s.todayRetention)}%</text>
          </g>
        )
      })}

      <line x1={x(0)} y1="0" x2={x(0)} y2={H + 2} stroke="rgba(25,181,230,0.18)" strokeWidth="1" strokeDasharray="3,3" />
      <text x={x(0) + 6} y="11" fontSize="8" fill="rgba(25,181,230,0.70)" fontFamily="JetBrains Mono, monospace">TODAY</text>
      <circle cx={x(0)} cy={y(primary.todayRetention)} r="8" fill="#19B5E6" opacity="0.12" filter="url(#dotGlow)" />
      <circle cx={x(0)} cy={y(primary.todayRetention)} r="4.5" fill="#19B5E6" filter="url(#dotGlow)" />
      <circle cx={x(0)} cy={y(primary.todayRetention)} r="2" fill="white" />
      <text x={x(0) - 7} y={y(primary.todayRetention) - 8} fontSize="9" fill="rgba(25,181,230,0.90)" fontFamily="JetBrains Mono, monospace" textAnchor="end" fontWeight="500">{primary.topic} {Math.round(primary.todayRetention)}%</text>
      <text x={x(maxDay * 0.6)} y={y(primary.projected[Math.floor(primary.projected.length * 0.6)]?.retention ?? 0) + 15} fontSize="8" fill="rgba(245,158,11,0.65)" fontFamily="JetBrains Mono, monospace">projected decay</text>
    </svg>
  )
}

// ─── Retention Ring ───────────────────────────────────────────────────────────
function RetentionRing({ pct, size = 38 }: { pct: number; size?: number }) {
  const r = (size - 7) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const color = pct >= 70 ? '#34D399' : pct >= 50 ? '#F59E0B' : '#F87171'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 3} textAnchor="middle" fontSize="8" fill={color}
        fontFamily="JetBrains Mono, monospace" fontWeight="500">{pct}%</text>
    </svg>
  )
}

// ─── Timer Circle SVG ─────────────────────────────────────────────────────────
// Single shared design used by both the normal Focus Lock layout and the
// fullscreen overlay. Deliberately minimal: a track, a glowing blue→cyan
// progress arc with a small tip dot, and the countdown itself. Nothing
// else lives inside the ring — no logo, no label, no subject name — so the
// time reads clearly at a glance in either mode.
function TimerCircle({ remaining, total, timeStr, running, size = 320 }: {
  remaining: number; total: number; timeStr: string; running: boolean; size?: number
}) {
  const R = Math.round(size * 0.42)
  const CX = size / 2, CY = size / 2
  const circ = 2 * Math.PI * R
  const progress = total > 0 ? 1 - remaining / total : 0
  const arcLen = progress * circ
  const tipAngle = -Math.PI / 2 + progress * 2 * Math.PI
  const tipX = CX + R * Math.cos(tipAngle)
  const tipY = CY + R * Math.sin(tipAngle)
  const sw = Math.max(4, Math.round(size * 0.026))
  const gid = `g${size}`
  const fontSize = size * (timeStr.length > 5 ? 0.148 : 0.192)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`ig${gid}`} cx="50%" cy="46%">
          <stop offset="0%" stopColor="#0C1730" />
          <stop offset="100%" stopColor="#05080F" />
        </radialGradient>
        <linearGradient id={`rg${gid}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="55%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <filter id={`rf${gid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.01} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`df${gid}`} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.012} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Outer ambient halo — restrained, not neon */}
      <circle cx={CX} cy={CY} r={R + sw + 5} fill="none" stroke="rgba(56,189,248,0.06)" strokeWidth={sw * 1.6} />
      {/* Track */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={sw} />
      {/* Inner dark fill */}
      <circle cx={CX} cy={CY} r={R - sw / 2 - 1} fill={`url(#ig${gid})`} />
      {/* Progress arc */}
      {arcLen > 2 && (
        <circle cx={CX} cy={CY} r={R} fill="none"
          stroke={`url(#rg${gid})`} strokeWidth={sw}
          strokeDasharray={`${arcLen} ${circ}`}
          strokeLinecap="round"
          filter={`url(#rf${gid})`}
          transform={`rotate(-90, ${CX}, ${CY})`}
        />
      )}
      {/* Small glowing dot at the progress tip */}
      {progress > 0.01 && (
        <>
          <circle cx={tipX} cy={tipY} r={sw * 0.95} fill="#38BDF8" opacity="0.25" filter={`url(#df${gid})`} />
          <circle cx={tipX} cy={tipY} r={sw * 0.48} fill="#BAE6FD" />
        </>
      )}
      {/* Countdown — the only content inside the ring */}
      <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
        fontSize={fontSize} fill="#F1F5F9" fontFamily="JetBrains Mono, monospace" fontWeight="600"
        style={{ letterSpacing: -fontSize * 0.02 }}>
        {timeStr}
      </text>
    </svg>
  )
}

// ─── Mountain Backdrop ────────────────────────────────────────────────────────
// Quiet, layered late-night mountain silhouette used behind the Focus Lock
// timer (both normal and fullscreen). Pure decoration — sits behind
// everything (pointer-events disabled) in dark navy monochrome so it never
// competes with the ring or the controls above it.
function MountainBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 65% 45% at 50% 28%, rgba(56,189,248,0.05), rgba(56,189,248,0) 70%)' }} />
      <svg viewBox="0 0 1200 520" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full" style={{ height: '58%' }}>
        {/* Farthest layer — subtle */}
        <polygon opacity="0.55" fill="#0E1B36"
          points="0,330 90,260 190,300 300,225 400,280 500,205 600,270 700,215 800,275 900,220 1000,285 1100,235 1200,290 1200,520 0,520" />
        {/* Mid layer */}
        <polygon opacity="0.78" fill="#0A1428"
          points="0,390 110,320 230,365 340,290 460,350 580,275 700,345 820,290 940,355 1060,300 1200,350 1200,520 0,520" />
        {/* Nearest layer — darkest, most defined */}
        <polygon opacity="0.96" fill="#050C1A"
          points="0,450 140,385 270,425 410,355 540,420 660,360 800,425 930,365 1060,420 1200,395 1200,520 0,520" />
      </svg>
    </div>
  )
}

// ─── Time Spinner Input ───────────────────────────────────────────────────────
function TimeSpinner({ label, value, onChange, max }: {
  label: string; value: number; onChange: (v: number) => void; max: number
}) {
  const f2 = (n: number) => String(n).padStart(2, '0')
  const inc = () => onChange(value >= max ? 0 : value + 1)
  const dec = () => onChange(value <= 0 ? max : value - 1)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={inc} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-violet-300 hover:bg-violet-500/10 transition-all">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 15l7-7 7 7" /></svg>
      </button>
      <input
        type="text" inputMode="numeric"
        className="w-16 h-14 text-center text-3xl font-mono bg-transparent outline-none text-white rounded-xl border border-violet-500/30 focus:border-violet-400/70 transition-colors"
        style={{ fontFamily: 'JetBrains Mono, monospace' }}
        value={f2(value)}
        onChange={e => {
          const v = parseInt(e.target.value.replace(/\D/g, '').slice(-2) || '0')
          onChange(Math.min(max, Math.max(0, isNaN(v) ? 0 : v)))
        }}
      />
      <div className="text-[10px] text-slate-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{label}</div>
      <button onClick={dec} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-violet-300 hover:bg-violet-500/10 transition-all">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M19 9l-7 7-7-7" /></svg>
      </button>
    </div>
  )
}

// ─── Nav Data ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' as const, group: 'HOME' },
  { id: 'focus', label: 'Focus Lock', icon: 'lock' as const, group: 'STUDY' },
  { id: 'schedules', label: 'Schedules', icon: 'clock' as const, group: 'STUDY' },
  { id: 'studyrooms', label: 'Study Room', icon: 'rooms' as const, group: 'STUDY' },
  { id: 'battleground', label: 'Battleground', icon: 'zap' as const, group: 'STUDY' },
  { id: '3dlibrary', label: '3D Library', icon: 'cube' as const, group: 'STUDY' },
  { id: 'wynkoins', label: 'WYNKOINS', icon: 'coin' as const, group: 'OTHER' },
  { id: 'earn', label: 'Earn with Wynko', icon: 'fire' as const, group: 'OTHER' },
  { id: 'settings', label: 'Settings', icon: 'cog' as const, group: 'OTHER' },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// profile is optional - the 10 other call sites below (Schedules,
// Study Rooms, Battleground, etc.) haven't had their own real-data
// pass yet, so they render without it and fall back to the same
// placeholder identity the design shipped with, same as before.
function Sidebar({ active, setActive, profile }: { active: string; setActive: (id: string) => void; profile?: { displayName: string | null; avatarUrl: string | null; exam: string | null } }) {
  const name = profile?.displayName || 'Jatin Sinsinwar'
  const exam = profile?.exam || 'JEE 2026'
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r h-full bg-[#060D1A] border-[rgba(26,40,69,0.55)]">
      <div className="flex items-center gap-3 px-5 py-[18px] border-b border-[rgba(26,40,69,0.55)]">
        <div className="w-8 h-8 relative flex-shrink-0">
          <img src={wynkoLogo} alt="Wynko" className="w-full h-full object-contain" style={{ mixBlendMode: 'screen', filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.8)) brightness(1.1)' }} />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 border-[#060D1A]" />
        </div>
        <div>
          <div className="text-white font-semibold text-base leading-none">Wynko</div>
          <div className="text-[10px] text-emerald-400 mt-0.5">● online</div>
        </div>
      </div>
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {['HOME', 'STUDY', 'OTHER'].map(group => (
          <div key={group} className="mb-5">
            <div className="text-[9px] font-semibold tracking-[0.15em] px-2 mb-1.5 text-[#4E5E84]">{group}</div>
            {NAV.filter(n => n.group === group).map(item => {
              const isActive = active === item.id
              return (
                <button key={item.id} onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 mb-0.5 group relative`}
                  style={{
                    background: isActive ? 'rgba(13,21,69,0.85)' : 'transparent',
                    color: isActive ? '#EEF2FF' : '#8B9AC7',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(139,92,255,0.3)' : 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#D9DDF0' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = '#8B9AC7' }}>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ background: '#8B5CFF', boxShadow: '0 0 10px rgba(139,92,255,0.9), 0 0 20px rgba(139,92,255,0.4)' }} />}
                  <Ico n={item.icon} cls={`w-4 h-4 flex-shrink-0`} style={{ color: isActive ? '#9B6CFF' : undefined }} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="border-t p-4 border-[rgba(26,40,69,0.55)]">
        <div className="flex items-center gap-2.5">
          <UserAvatar size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-200 font-medium truncate">{name}</div>
            <div className="text-[10px] text-slate-500">{exam}</div>
          </div>
          <button className="text-slate-600 hover:text-slate-300 transition-colors"><Ico n="cog" cls="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </aside>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ profile }: { profile?: { displayName: string | null; avatarUrl: string | null; exam: string | null } } = {}) {
  // Same real-date computation TodayHero already uses below on this
  // page (new Date(), not a placeholder) - this was the one spot on
  // Home still showing the design's literal "Mon, 1 Sep 2026" string.
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 backdrop-blur-sm bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
      <div className="flex-1">
        <div className="text-[10px] text-slate-600 mb-0.5">Home / Today</div>
        <div className="text-sm font-semibold text-slate-200">{todayLabel}</div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 text-sm w-52 border bg-[#0B1530] border-[#1A2845]">
        <Ico n="search" cls="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs text-slate-500 flex-1">Search topics...</span>
        <kbd className="text-[10px] rounded px-1 text-slate-600 font-mono border bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.08)]">⌘K</kbd>
      </div>
      <button className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors">
        <Ico n="bell" cls="w-5 h-5" />
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" style={{ boxShadow: '0 0 6px rgba(155,108,255,0.8)' }} />
      </button>
      <UserAvatar size={32} className="cursor-pointer" />
    </header>
  )
}

// ─── Today Hero ───────────────────────────────────────────────────────────────
function TodayHero({ onGoFocus, atRisk, due, stable, curveData }: { onGoFocus: () => void; atRisk: number; due: number; stable: number; curveData: MultiRecallCurveData | null }) {
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()
  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border"
      style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: '0 0 60px rgba(124,77,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26,40,69,0.55) 0%, transparent 65%)', transform: 'translate(25%,-30%)' }} />
      <div className="absolute bottom-0 left-1/3 w-56 h-56 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(25,181,230,0.06) 0%, transparent 65%)', transform: 'translate(-50%,40%)' }} />
      <div className="relative flex gap-6 items-stretch">
        <div className="flex-shrink-0 w-44 flex flex-col justify-between">
          <div>
            <div className="text-[9px] font-mono text-violet-400 tracking-[0.2em] mb-2">TODAY · {dateLabel}</div>
            <div className="text-[22px] font-bold text-slate-100 leading-tight mb-2">Memory<br />at Risk</div>
            <div className="text-xs text-slate-400 mb-4 leading-relaxed">
              {atRisk > 0 ? `${atRisk} topic${atRisk > 1 ? 's' : ''} below critical retention threshold` : 'All topics above critical threshold'}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-[rgba(248,113,113,0.07)] border-[rgba(248,113,113,0.2)]">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-red-300">{atRisk} topic{atRisk !== 1 ? 's' : ''} at risk</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-[rgba(124,77,255,0.08)] border-[#1A2845]">
              <Ico n="wave" cls="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span className="text-[11px] text-violet-300">{due} review{due !== 1 ? 's' : ''} due</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-[rgba(25,211,162,0.07)] border-[rgba(25,211,162,0.20)]">
              <Ico n="check" cls="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-300">{stable} stable</span>
            </div>
            <button onClick={onGoFocus} className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7C4DFF, #5C35CC)', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
              <Ico n="play" cls="w-3 h-3" />Start Review
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] font-mono text-slate-500 tracking-wide uppercase">
              RECALL CURVE{curveData && curveData.series.length === 1 ? ` — ${curveData.series[0].subject.toUpperCase()} · ${curveData.series[0].topic}` : curveData && curveData.series.length > 1 ? ` — ${curveData.series.length} TOPICS` : ''}
            </div>
            <div className="flex items-center gap-3 text-[9px] font-mono text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-4 h-[2px] rounded" style={{ background: 'linear-gradient(90deg,#7C4DFF,#19B5E6)' }} />actual</div>
              <div className="flex items-center gap-1.5"><div className="w-4 border-t border-amber-400 border-dashed" />projected</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-cyan-400 opacity-80" />review</div>
            </div>
          </div>
          <div className="flex-1" style={{ minHeight: '170px' }}><RecallCurve data={curveData} /></div>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
function QuickActions({ onGoFocus, onNavigate }: { onGoFocus: () => void; onNavigate: (id: string) => void }) {
  const actions = [
    { label: 'Start Focus', sub: 'Focus Lock', icon: 'lock' as const, grad: 'linear-gradient(135deg,#7C4DFF,#5C35CC)', glow: '0 0 28px rgba(124,77,255,0.65), 0 4px 24px rgba(92,53,204,0.4)', onClick: onGoFocus },
    { label: 'Schedules', sub: 'Plan sessions', icon: 'clock' as const, grad: 'linear-gradient(135deg,#0F99CC,#0C7FAA)', glow: '0 0 24px rgba(15,153,204,0.55), 0 4px 20px rgba(12,127,170,0.35)', onClick: () => onNavigate('schedules') },
    { label: 'Study Room', sub: '24 online', icon: 'rooms' as const, grad: 'linear-gradient(135deg,#0A9673,#077A5E)', glow: '0 0 24px rgba(10,150,115,0.5), 0 4px 20px rgba(7,122,94,0.3)', onClick: () => onNavigate('studyrooms') },
    { label: '3D Library', sub: 'Virtual Space', icon: 'cube' as const, grad: 'linear-gradient(135deg,#5835CC,#4630AA)', glow: '0 0 24px rgba(88,53,204,0.55), 0 4px 20px rgba(70,48,170,0.35)', onClick: () => onNavigate('3dlibrary') },
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((a, i) => (
        <button key={i} onClick={a.onClick}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
          style={{ background: a.grad, boxShadow: a.glow }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[rgba(0,0,0,0.2)]">
            <Ico n={a.icon} cls="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white leading-none">{a.label}</div>
            <div className="text-[10px] text-white/55 mt-0.5">{a.sub}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Quick Add Unit ───────────────────────────────────────────────────────────
const SUBJECT_SUGGESTIONS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Geography', 'Computer Science', 'Economics', 'Psychology']
const EXAM_SUGGESTIONS = ['JEE Advanced', 'JEE Mains', 'NEET 2026', 'UPSC', 'GATE', 'SAT', 'General']

function QuickAddUnit({ added, onAdd, onRemove }: { added: StudyUnit[]; onAdd: (u: StudyUnit) => void; onRemove: (subject: string) => void }) {
  const [subject, setSubject] = useState('')
  const [exam, setExam] = useState('')
  const [topic, setTopic] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [examOpen, setExamOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const subjectRef = useRef<HTMLDivElement>(null)
  const examRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (subjectRef.current && !subjectRef.current.contains(e.target as Node)) setSubjectOpen(false)
      if (examRef.current && !examRef.current.contains(e.target as Node)) setExamOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredSubjects = SUBJECT_SUGGESTIONS.filter(s => !subject || s.toLowerCase().includes(subject.toLowerCase()))
  const filteredExams = EXAM_SUGGESTIONS.filter(e => !exam || e.toLowerCase().includes(exam.toLowerCase()))

  function addTopic() {
    const t = topic.trim()
    if (t && !topics.includes(t)) { setTopics(prev => [...prev, t]); setTopic('') }
  }
  function removeTopic(t: string) { setTopics(prev => prev.filter(x => x !== t)) }

  function handleQuickAdd() {
    const s = subject.trim()
    const allTopics = [...topics, ...(topic.trim() ? [topic.trim()] : [])]
    if (!s || allTopics.length === 0) return
    onAdd({ subject: s, exam: exam.trim(), topics: allTopics })
    setSubject(''); setExam(''); setTopic(''); setTopics([])
    setFlash(true)
    setTimeout(() => setFlash(false), 1200)
  }

  const canAdd = subject.trim() && (topics.length > 0 || topic.trim())

  return (
    <div className="rounded-2xl border p-4 transition-all" style={{
      background: '#0B1530',
      borderColor: flash ? 'rgba(25,181,230,0.50)' : '#1A2845',
      boxShadow: flash ? '0 0 30px rgba(25,181,230,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      transition: 'border-color 0.4s, box-shadow 0.4s',
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">NEW STUDY UNIT: QUICK ADD</div>
        {added.length > 0 && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-[#19D3A2] bg-[rgba(25,211,162,0.08)] border-[rgba(25,211,162,0.25)]">
            {added.length} unit{added.length > 1 ? 's' : ''} added
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Subject */}
        <div ref={subjectRef} className="relative">
          <div className="flex items-center px-3 py-2 rounded-xl border cursor-text min-w-[180px] transition-colors"
            style={{ background: '#0B1530', borderColor: subjectOpen ? '#4A3A88' : '#1A2845' }}
            onClick={() => setSubjectOpen(true)}>
            <input className="bg-transparent outline-none text-sm text-slate-200 w-full placeholder-slate-500"
              placeholder="Subject name"
              value={subject} onChange={e => { setSubject(e.target.value); setSubjectOpen(true) }} onFocus={() => setSubjectOpen(true)} />
          </div>
          {subjectOpen && filteredSubjects.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 rounded-xl border overflow-hidden w-full min-w-[200px]"
              style={{ background: '#0B1530', borderColor: '#1E3060', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {filteredSubjects.map(s => (
                <button key={s} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-violet-500/10 hover:text-violet-200 transition-colors"
                  onMouseDown={e => { e.preventDefault(); setSubject(s); setSubjectOpen(false) }}>{s}</button>
              ))}
              {subject && !SUBJECT_SUGGESTIONS.map(s => s.toLowerCase()).includes(subject.toLowerCase()) && (
                <button className="w-full text-left px-3 py-2 text-sm border-t transition-colors text-[#9B6CFF] border-[#1A2845]"
                  onMouseDown={e => { e.preventDefault(); setSubjectOpen(false) }}>
                  Use "{subject}"
                </button>
              )}
            </div>
          )}
        </div>
        {/* Topic */}
        <div className="flex items-center px-3 py-2 rounded-xl border transition-colors" style={{ background: '#0B1530', borderColor: '#1A2845', width: '180px' }}>
          <input className="bg-transparent outline-none text-sm text-slate-200 w-full placeholder-slate-500"
            placeholder="Topic name"
            value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTopic() }} />
        </div>
        {/* Quick Add */}
        <button onClick={handleQuickAdd}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97] flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C4DFF, #19B5E6)', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(25,181,230,0.2)', opacity: canAdd ? 1 : 0.45 }}>
          Quick Add
        </button>
      </div>
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {topics.map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border text-[#C4AAFF] bg-[rgba(26,40,69,0.55)] border-[#1E3060]">
              {t}
              <button onClick={() => removeTopic(t)} className="text-slate-500 hover:text-red-400 transition-colors leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      {added.length > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-2 border-[rgba(26,40,69,0.55)]">
          {added.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border group text-[#7DD8F0] bg-[rgba(25,181,230,0.06)] border-[rgba(25,181,230,0.20)]">
              <Ico n="check" cls="w-3 h-3 text-emerald-400" />
              {u.subject}{u.exam ? ` › ${u.exam}` : ''} · {u.topics.join(', ')}
              <button onClick={() => onRemove(u.subject)}
                className="ml-1 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Review Queue ─────────────────────────────────────────────────────────────
function ReviewQueue({ items, onDismiss }: {
  items: ReviewItem[]
  onDismiss: (key: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const tagCls = {
    high: { text: 'text-red-400', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'Review now' },
    medium: { text: 'text-amber-400', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'Review soon' },
    low: { text: 'text-emerald-400', bg: 'rgba(25,211,162,0.08)', border: 'rgba(25,211,162,0.22)', label: 'Stable' },
  }

  // Group by subject
  const grouped: Record<string, ReviewItem[]> = {}
  for (const item of items) {
    if (!grouped[item.subject]) grouped[item.subject] = []
    grouped[item.subject].push(item)
  }
  const subjects = Object.keys(grouped)

  const due = items.filter(i => i.urgency !== 'low').length

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-100">Review Queue</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Topics needing your attention</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <div className="text-3xl mb-3">🎉</div>
          <div className="text-sm font-semibold text-slate-300 mb-1">All clear!</div>
          <div className="text-[12px] text-slate-500 max-w-[200px]">Add subjects to your schedule on previous days to see review items here.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Review Queue</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Topics from previous sessions</div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-[#9B6CFF] bg-[rgba(26,40,69,0.55)] border-[#1E3060]">{due} due</span>
      </div>

      {/* Grouped dropdown accordion */}
      <div className="space-y-2 flex-1 overflow-y-auto">
        {subjects.map(subj => {
          const group = grouped[subj]
          const isOpen = expanded[subj] ?? true
          const worstRetention = Math.min(...group.map(g => g.retention))
          const worstUrgency = group.some(g => g.urgency === 'high') ? 'high' : group.some(g => g.urgency === 'medium') ? 'medium' : 'low'
          const t = tagCls[worstUrgency]
          return (
            <div key={subj} className="rounded-xl border overflow-hidden border-[rgba(26,40,69,0.55)] bg-[#0B1530]">
              {/* Subject header — click to expand/collapse */}
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(prev => ({ ...prev, [subj]: !isOpen }))}>
                <RetentionRing pct={worstRetention} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate">{subj}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{group.length} topic{group.length > 1 ? 's' : ''} pending</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono flex-shrink-0 mr-1" style={{ color: t.text, background: t.bg, borderColor: t.border }}>{t.label}</span>
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-500 flex-shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
              </button>
              {/* Topic rows */}
              {isOpen && (
                <div className="border-t border-[rgba(26,40,69,0.55)]">
                  {group.map(item => {
                    const tc = tagCls[item.urgency]
                    const daysLabel = item.daysAgo === 1 ? 'Yesterday' : `${item.daysAgo} days ago`
                    return (
                      <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-0 group hover:bg-violet-500/5 transition-colors border-[rgba(124,77,255,0.08)]">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ background: item.urgency === 'high' ? '#F87171' : item.urgency === 'medium' ? '#FBBF24' : '#19D3A2' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-slate-300 truncate">{item.topic}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{daysLabel} · {item.retention}% retention</div>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono" style={{ color: tc.text, borderColor: tc.border, background: tc.bg }}>{tc.label}</span>
                          <button onClick={() => onDismiss(item.key)}
                            className="text-[11px] px-2 py-1 rounded-lg border transition-all hover:border-emerald-500/50 hover:text-emerald-300 text-[#C4AAFF] bg-[rgba(26,40,69,0.55)] border-[#1A2845]">
                            ✓ Done
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Focus Panel ──────────────────────────────────────────────────────────────
// sessions/gauge/streak were fully hardcoded before this pass (fixed
// "1h 15m of 2h 30m", a fixed 3-item Mathematics/Physics/Chemistry
// list, fixed "7-day streak"). Now driven by todayFocus from
// useHomeData: goal + done minutes from daily_focus_goal_minutes +
// today's study_log entry, per-subject rows from that same entry
// (real subjects actually logged today, not a fixed planned list -
// there's no "planned session" concept in the data, only what was
// actually studied), and streak computed the same way tracker.html's
// renderAnalytics() does from study_log.
function FocusPanel({ onGoFocus, todayFocus }: { onGoFocus: () => void; todayFocus?: TodayFocus }) {
  const goalMinutes = todayFocus?.goalMinutes ?? 150
  const doneMinutes = todayFocus?.doneMinutes ?? 0
  const bySubject = todayFocus?.bySubject ?? []
  const streakDays = todayFocus?.streakDays ?? 0
  const pct = goalMinutes > 0 ? Math.min(1, doneMinutes / goalMinutes) : 0
  const arcLen = Math.PI * 56
  const fmtHM = (mins: number) => {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  const goalLabel = goalMinutes >= 60 ? `${(goalMinutes / 60).toFixed(goalMinutes % 60 === 0 ? 0 : 1)}h` : `${goalMinutes}m`
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Today's Focus</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{fmtHM(goalMinutes)} planned</div>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          <Ico n="fire" cls="w-3.5 h-3.5" />
          <span className="text-xs font-semibold">{streakDays}-day streak</span>
        </div>
      </div>
      <div className="flex justify-center mb-3">
        <svg width="150" height="86" viewBox="0 0 150 86">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7C4DFF" /><stop offset="100%" stopColor="#19B5E6" /></linearGradient>
            <filter id="gaugeGlow"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <path d="M 19,80 A 56,56 0 0,1 131,80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" strokeLinecap="round" />
          <path d="M 19,80 A 56,56 0 0,1 131,80" fill="none" stroke="url(#gaugeGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct * arcLen} ${arcLen}`} filter="url(#gaugeGlow)" />
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const angle = Math.PI * (1 - t)
            const x1 = 75 + 56 * Math.cos(angle), y1 = 80 - 56 * Math.sin(angle)
            const x2 = 75 + 47 * Math.cos(angle), y2 = 80 - 47 * Math.sin(angle)
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1A2845" strokeWidth="1.5" />
          })}
          <text x="75" y="60" textAnchor="middle" fontSize="15" fontWeight="600" fill="#EEF2FF" fontFamily="JetBrains Mono, monospace">{fmtHM(doneMinutes)}</text>
          <text x="75" y="75" textAnchor="middle" fontSize="8.5" fill="rgba(148,163,184,0.5)" fontFamily="JetBrains Mono, monospace">of {fmtHM(goalMinutes)}</text>
          <text x="16" y="84" fontSize="8" fill="rgba(148,163,184,0.3)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">0</text>
          <text x="134" y="84" fontSize="8" fill="rgba(148,163,184,0.3)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{goalLabel}</text>
        </svg>
      </div>
      <div className="space-y-1.5 flex-1">
        {bySubject.length === 0 ? (
          <div className="text-[11px] text-slate-600 text-center py-4">Nothing logged yet today</div>
        ) : bySubject.map((s) => (
          <div key={s.subject} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(124,77,255,0.08)', border: '1px solid rgba(26,40,69,0.55)' }}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-violet-400" />
            <span className="text-[11px] flex-1 text-slate-300">{s.subject}</span>
            <span className="text-[10px] text-slate-500">{s.minutes} min</span>
            <Ico n="check" cls="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          </div>
        ))}
      </div>
      <button onClick={onGoFocus} className="mt-4 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7C4DFF 0%, #19B5E6 100%)', boxShadow: '0 0 24px rgba(124,77,255,0.55), 0 0 48px rgba(25,181,230,0.2)' }}>
        <Ico n="lock" cls="w-4 h-4" />Start Focus Lock
      </button>
    </div>
  )
}

// ─── Study Rooms ──────────────────────────────────────────────────────────────
const ROOMS = [
  { name: 'JEE Physics — Night Grind', cat: 'JEE Advanced', cur: 12, max: 20, cam: 'Cam off', avatars: [{ bg: '#7C4DFF', init: 'RS' }, { bg: '#0F99CC', init: 'PK' }, { bg: '#EC4899', init: 'AM' }], extra: '+9' },
  { name: 'NEET Biology — Focus Room', cat: 'NEET 2026', cur: 8, max: 15, cam: 'Cam optional', avatars: [{ bg: '#0DAE86', init: 'SK' }, { bg: '#3B82F6', init: 'DL' }, { bg: '#F59E0B', init: 'MK' }], extra: '+5' },
  { name: 'Math Olympiad Prep', cat: 'Competition', cur: 5, max: 10, cam: 'Cam on', avatars: [{ bg: '#F97316', init: 'AK' }, { bg: '#7C4DFF', init: 'RV' }], extra: '+3' },
]
function StudyRooms({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Live Study Rooms</div>
          <div className="text-[11px] text-slate-500 mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>Active right now</div>
        </div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="text-[10px] text-emerald-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>25 studying</span></div>
      </div>
      <div className="space-y-2.5 flex-1">
        {ROOMS.map((room, i) => (
          <div key={i} onClick={() => onNavigate('studyrooms')} className="p-3 rounded-xl border transition-all group hover:border-violet-500/30 cursor-pointer" style={{ background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(124,58,237,0.16)' }}>
            <div className="flex items-start justify-between mb-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-200 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>{room.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{room.cat}</div>
              </div>
              <div className="flex-shrink-0 ml-3 flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-semibold text-emerald-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{room.cur}</span>
                <span className="text-[10px] text-slate-600" style={{ fontFamily: 'JetBrains Mono, monospace' }}>/ {room.max}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {room.avatars.map((av, j) => (<div key={j} className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white border-2" style={{ background: av.bg, borderColor: '#0A0D1E' }}>{av.init}</div>))}
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-slate-400 border-2" style={{ background: 'rgba(14,21,40,0.9)', borderColor: '#0A0D1E' }}>{room.extra}</div>
                </div>
                <div className="flex items-center gap-1 text-slate-500"><Ico n="video" cls="w-3 h-3" /><span className="text-[10px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{room.cam}</span></div>
              </div>
              <button className="text-[11px] px-2.5 py-1 rounded-lg border opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#C4B5FD', background: 'rgba(124,58,237,0.1)', borderColor: 'rgba(124,58,237,0.28)', fontFamily: 'Poppins, sans-serif' }}>Join →</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => onNavigate('studyrooms')} className="mt-3 w-full py-2 rounded-xl text-[12px] font-semibold text-violet-300 border transition-all hover:bg-violet-500/10"
        style={{ borderColor: 'rgba(124,58,237,0.25)' }}>View All Rooms →</button>
    </div>
  )
}

// ─── 3D Library Preview ───────────────────────────────────────────────────────
const DESK_AVATARS: Record<string, { color: string; init: string }> = {
  '1-1': { color: '#7C3AED', init: 'AR' }, '3-1': { color: '#22D3EE', init: 'SK' },
  '1-3': { color: '#34D399', init: 'PM' }, '3-3': { color: '#F59E0B', init: 'DJ' },
  '2-2': { color: '#F87171', init: 'KV' }, '4-2': { color: '#818CF8', init: 'RV' },
}
function LibraryPreview({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>3D Library</div>
          <div className="text-[11px] text-slate-500 mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>Virtual study environment</div>
        </div>
        <button onClick={() => onNavigate('3dlibrary')} className="flex items-center gap-1 text-[11px] transition-colors hover:text-slate-200" style={{ color: '#A78BFA', fontFamily: 'Poppins, sans-serif' }}>
          Explore <Ico n="arrow" cls="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 relative rounded-xl overflow-hidden border" style={{ background: '#060810', borderColor: 'rgba(124,58,237,0.2)', minHeight: '130px' }}>
        <svg viewBox="0 0 400 175" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs><filter id="libGlow"><feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {[0, 1, 2, 3, 4].map(j => [0, 1, 2, 3, 4, 5].map(i => {
            const tw = 44, th = 22, cx = 200, cy = 28
            const x = cx + (i - j) * tw / 2, y = cy + (i + j) * th / 2
            const key = `${i}-${j}`, desk = DESK_AVATARS[key], isDesk = !!desk
            return (
              <g key={key}>
                <polygon points={`${x},${y} ${x + tw / 2},${y + th / 2} ${x},${y + th} ${x - tw / 2},${y + th / 2}`} fill={isDesk ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.5)'} stroke="rgba(99,102,241,0.1)" strokeWidth="0.75" />
                {isDesk && (<>
                  <polygon points={`${x},${y - 7} ${x + tw / 2 - 5},${y + th / 2 - 5} ${x},${y + th - 8} ${x - tw / 2 + 5},${y + th / 2 - 5}`} fill="rgba(99,102,241,0.18)" stroke="rgba(139,92,246,0.45)" strokeWidth="1" />
                  <polygon points={`${x - tw / 2 + 5},${y + th / 2 - 5} ${x},${y + th - 8} ${x},${y + th - 1} ${x - tw / 2 + 5},${y + th / 2 + 2}`} fill="rgba(50,40,100,0.6)" stroke="rgba(99,102,241,0.2)" strokeWidth="0.75" />
                  <circle cx={x} cy={y - 14} r="6" fill={desk.color} filter="url(#libGlow)" opacity="0.9" />
                  <text x={x} y={y - 11} textAnchor="middle" fontSize="5" fill="white" fontFamily="Poppins, sans-serif" fontWeight="700">{desk.init}</text>
                </>)}
              </g>
            )
          }))}
          <text x="100" y="95" fontSize="8" fill="rgba(124,58,237,0.45)" fontFamily="JetBrains Mono, monospace">Focus Zone</text>
          <text x="255" y="68" fontSize="8" fill="rgba(34,211,238,0.45)" fontFamily="JetBrains Mono, monospace">Collab Zone</text>
          <text x="200" y="168" textAnchor="middle" fontSize="8" fill="rgba(100,116,139,0.5)" fontFamily="JetBrains Mono, monospace">40 seats · 6 occupied · 34 available</text>
        </svg>
      </div>
      <button onClick={() => onNavigate('3dlibrary')} className="mt-3 w-full py-2 rounded-xl text-[12px] font-semibold text-violet-300 border transition-all hover:bg-violet-500/10"
        style={{ borderColor: 'rgba(124,58,237,0.25)' }}>Enter 3D Library →</button>
    </div>
  )
}

// ─── Subject colors ───────────────────────────────────────────────────────────
const SUBJ_COLORS = ['#3B82F6', '#8B5CF6', '#14B8A6', '#22C55E', '#F59E0B', '#EC4899', '#F97316', '#6366F1']
const TASK_EMOJIS = ['📘', '🩺', '💊', '🧑\u200d🎓', '📄', '🧪', '📐', '🔬', '🧠', '📖']

// Deterministic (not random) icon/color per subject, so the same subject
// always renders the same glyph across renders/sessions without needing
// to persist it separately.
function hashSubject(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function subjectVisual(subject: string) {
  const h = hashSubject(subject || 'General')
  return { emoji: TASK_EMOJIS[h % TASK_EMOJIS.length], color: SUBJ_COLORS[h % SUBJ_COLORS.length] }
}

function formatClock(totalSecs: number, alwaysHours = false): string {
  const secs = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const f2 = (n: number) => String(n).padStart(2, '0')
  return alwaysHours || h > 0 ? `${f2(h)}:${f2(m)}:${f2(s)}` : `${f2(m)}:${f2(s)}`
}

// ─── Focus Lock Page ──────────────────────────────────────────────────────────
// Redesigned around per-task (subject + topic) timers instead of one global
// countdown. Two independent timer "modes" a task can run in:
//   - Pomodoro: counts DOWN from 25:00.
//   - Regular: counts UP from 00:00:00, no limit.
// Only one task can actually be "live" against the backend at a time
// (study_sessions enforces a single open row per user - see
// useFocusSession), so starting a task stops whatever task was previously
// running, exactly like the old subject-switch behavior. Each task keeps
// its own paused/resumed value locally so switching between tasks (or
// navigating away and back) never silently resets someone else's progress.
const FL_PLAN_KEY = 'wynko_focus_plan_v1'
type TimerMode = 'pomodoro' | 'regular'
interface StudyTask {
  id: string
  subject: string
  topic: string
  mode: TimerMode
  pomodoroRemaining: number // seconds left, meaningful when mode === 'pomodoro'
  regularElapsed: number    // seconds elapsed, meaningful when mode === 'regular'
}
interface FocusPlanSnapshot {
  tasks: StudyTask[]
  activeTaskId: string | null
  running: boolean
  runningStartedAtMs: number | null // Date.now() snapshot for offline/away catch-up
}
const POMODORO_DEFAULT_SECS = 25 * 60

function loadFocusPlanSnapshot(): FocusPlanSnapshot | null {
  try {
    const raw = localStorage.getItem(FL_PLAN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.tasks)) return parsed
  } catch { /* corrupt/inaccessible storage - just start fresh */ }
  return null
}
function saveFocusPlanSnapshot(snap: FocusPlanSnapshot) {
  try { localStorage.setItem(FL_PLAN_KEY, JSON.stringify(snap)) } catch { /* best-effort */ }
}

function makeTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Seeds the plan from real data (quick-added topics + today's schedule) —
// same de-dup key (subject::topic) the old TasksPanel used — rather than
// ever hard-coding example subjects. Starts empty if there's genuinely
// nothing yet; the empty state below invites adding a task instead.
function seedTasksFromRealData(units: StudyUnit[], schedule: ScheduleItem[][], todayIdx: number): StudyTask[] {
  const tasks: StudyTask[] = []
  const seen = new Set<string>()
  const addTask = (subject: string, topic: string) => {
    const key = `${subject}::${topic}`
    if (seen.has(key)) return
    seen.add(key)
    tasks.push({ id: makeTaskId(), subject, topic, mode: 'pomodoro', pomodoroRemaining: POMODORO_DEFAULT_SECS, regularElapsed: 0 })
  }
  units.forEach(u => u.topics.forEach(t => addTask(u.subject, t)))
  const todaySchedule = schedule[todayIdx] || []
  todaySchedule.forEach(s => addTask(s.subject, s.topic || s.subject))
  return tasks
}

// ─── Timer mode selector (segmented control) ──────────────────────────────────
function ModeTab({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all flex-1 sm:flex-none"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(124,77,255,0.28), rgba(25,181,230,0.14))' : '#0B1530',
        borderColor: active ? '#6B44EE' : '#1A2845',
        boxShadow: active ? '0 0 24px rgba(124,77,255,0.35)' : 'none',
      }}>
      <span className="text-xl flex-shrink-0 leading-none">{icon}</span>
      <span className="text-left">
        <span className="block text-sm font-semibold text-slate-100">{title}</span>
        <span className="block text-[11px] text-slate-400">{sub}</span>
      </span>
    </button>
  )
}

// ─── My Study Plan row ─────────────────────────────────────────────────────────
function StudyPlanRow({ task, isActive, running, onStart, onPause, onRemove }: {
  task: StudyTask; isActive: boolean; running: boolean
  onStart: () => void; onPause: () => void; onRemove: () => void
}) {
  const { emoji, color } = subjectVisual(task.subject)
  const [menuOpen, setMenuOpen] = useState(false)
  const displaySecs = task.mode === 'pomodoro' ? task.pomodoroRemaining : task.regularElapsed
  const timeStr = formatClock(displaySecs, task.mode === 'regular')
  const isLiveRunning = isActive && running

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
      style={{
        background: isActive ? 'rgba(124,77,255,0.07)' : 'rgba(11,21,48,0.55)',
        borderColor: isActive ? 'rgba(124,77,255,0.35)' : 'rgba(26,40,69,0.7)',
      }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ background: `${color}1A`, border: `1px solid ${color}44` }}>{emoji}</div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate">{task.subject}</div>
        <div className="text-[11px] text-slate-500 truncate">{task.topic}</div>
      </div>

      <div className="text-right flex-shrink-0 hidden sm:block" style={{ width: 96 }}>
        <div className="text-[11px] font-medium flex items-center justify-end gap-1"
          style={{ color: task.mode === 'pomodoro' ? '#F87171' : '#38BDF8' }}>
          {task.mode === 'pomodoro' ? <>🍅 Pomodoro</> : <><Ico n="clock" cls="w-3 h-3" /> Regular</>}
        </div>
        <div className="text-[12px] font-mono mt-0.5" style={{ color: isLiveRunning ? '#E2E8F0' : '#8B9AC7' }}>{timeStr}</div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onStart} disabled={isLiveRunning}
          title="Start"
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-40 hover:opacity-90 active:scale-95"
          style={{ background: '#19D3A2', color: '#04140F' }}>
          <Ico n="play" cls="w-3.5 h-3.5" />
        </button>
        <button onClick={onPause} disabled={!isLiveRunning}
          title="Pause"
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30 hover:opacity-90 active:scale-95"
          style={{ background: '#1A2845', color: '#C7D2FE' }}>
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen(v => !v)} title="More"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border overflow-hidden whitespace-nowrap"
              style={{ background: '#0B1530', borderColor: '#1E3060', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); onRemove() }}
                className="px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors w-full text-left">
                Remove task
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add Task modal ─────────────────────────────────────────────────────────────
function AddTaskModal({ onClose, onAdd }: { onClose: () => void; onAdd: (subject: string, topic: string, mode: TimerMode) => void }) {
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<TimerMode>('pomodoro')
  const canAdd = subject.trim().length > 0 && topic.trim().length > 0

  function submit() {
    if (!canAdd) return
    onAdd(subject.trim(), topic.trim(), mode)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.75)]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-2xl border p-7 w-[380px] max-w-[92vw]"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
        <div className="mb-5">
          <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1.5">ADD TASK</div>
          <div className="text-lg font-semibold text-slate-100">New study task</div>
        </div>

        <label className="block text-[11px] text-slate-500 mb-1.5">Subject</label>
        <input autoFocus value={subject} onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Physics"
          list="focus-subject-suggestions"
          className="w-full mb-4 px-3 py-2.5 rounded-xl border bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600 transition-colors focus:border-violet-400/70"
          style={{ borderColor: '#1A2845' }} />
        <datalist id="focus-subject-suggestions">
          {SUBJECT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
        </datalist>

        <label className="block text-[11px] text-slate-500 mb-1.5">Topic</label>
        <input value={topic} onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. Electricity"
          className="w-full mb-4 px-3 py-2.5 rounded-xl border bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600 transition-colors focus:border-violet-400/70"
          style={{ borderColor: '#1A2845' }} />

        <label className="block text-[11px] text-slate-500 mb-1.5">Timer mode</label>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode('pomodoro')}
            className="flex-1 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all"
            style={{ background: mode === 'pomodoro' ? 'rgba(124,77,255,0.18)' : 'transparent', borderColor: mode === 'pomodoro' ? '#6B44EE' : '#1A2845', color: mode === 'pomodoro' ? '#C4AAFF' : '#8B9AC7' }}>
            🍅 Pomodoro
          </button>
          <button onClick={() => setMode('regular')}
            className="flex-1 px-3 py-2 rounded-xl border text-[12px] font-medium transition-all"
            style={{ background: mode === 'regular' ? 'rgba(25,181,230,0.18)' : 'transparent', borderColor: mode === 'regular' ? '#19B5E6' : '#1A2845', color: mode === 'regular' ? '#7DD8F0' : '#8B9AC7' }}>
            🕐 Regular
          </button>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">
            Cancel
          </button>
          <button onClick={submit} disabled={!canAdd}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7C4DFF, #6B44EE)', boxShadow: '0 0 24px rgba(124,77,255,0.55), 0 0 48px rgba(25,181,230,0.2)' }}>
            Add Task
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Current Focus panel ────────────────────────────────────────────────────────
function CurrentFocusPanel({ task }: { task: StudyTask | null }) {
  return (
    <div className="rounded-2xl border p-4" style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Ico n="target" cls="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-slate-100">Current Focus</span>
      </div>
      {task ? (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] tracking-wide text-slate-500 mb-1.5">Subject</div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(26,40,69,0.5)' }}>
              <Ico n="library" cls="w-4 h-4 text-violet-300 flex-shrink-0" />
              <span className="text-sm text-slate-100 truncate">{task.subject}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-wide text-slate-500 mb-1.5">Topic</div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(26,40,69,0.5)' }}>
              <Ico n="check" cls="w-4 h-4 text-cyan-300 flex-shrink-0" />
              <span className="text-sm text-slate-100 truncate">{task.topic}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-2xl mb-2">🎯</div>
          <div className="text-xs text-slate-500">No active session yet.<br />Start a task in My Study Plan.</div>
        </div>
      )}
    </div>
  )
}

// ─── Quick Notes panel ───────────────────────────────────────────────────────────
// Purely local scratch space for the current session - not synced anywhere,
// same "ephemeral by design" spirit as the old Tasks checklist it replaces.
function QuickNotesPanel() {
  const [note, setNote] = useState('')
  return (
    <div className="rounded-2xl border p-4 flex-1 flex flex-col min-h-[140px]"
      style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">📝</span>
        <span className="text-sm font-semibold text-slate-100">Quick Notes</span>
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)}
        placeholder="No notes yet…
Add a quick note for this session."
        className="flex-1 w-full bg-transparent outline-none text-[13px] leading-relaxed text-slate-300 placeholder-slate-600 resize-none" />
    </div>
  )
}

function FocusLockPage({ units, schedule, todayIdx, onNavigate, profile }: { units: StudyUnit[]; schedule: ScheduleItem[][]; todayIdx: number; onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  const [snapshot] = useState(loadFocusPlanSnapshot)
  const [tasks, setTasks] = useState<StudyTask[]>(() => snapshot?.tasks ?? seedTasksFromRealData(units, schedule, todayIdx))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(snapshot?.activeTaskId ?? null)
  const [running, setRunning] = useState<boolean>(!!snapshot?.running)
  const [selectedMode, setSelectedMode] = useState<TimerMode>('pomodoro')
  const [fullscreen, setFullscreen] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const didCatchUp = useRef(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // True browser Fullscreen API when available (desktop + most mobile
  // browsers), with the always-on CSS overlay below as the visual
  // fallback for browsers that refuse/lack it (notably iOS Safari for
  // non-<video> elements) - either way the distraction-free overlay
  // renders, so "fullscreen" always works even without OS-level support.
  //
  // The native request targets <html>, NOT the overlay element: setFullscreen(true)
  // only *schedules* the overlay's render, so an overlay ref is still null at
  // this point and the request silently never fired (no native fullscreen =>
  // nothing for Esc to exit). <html> always exists, and the request must run
  // synchronously inside the click to keep the browser's user-gesture grant.
  function enterFullscreen() {
    setFullscreen(true)
    try {
      const el = document.documentElement as any
      const req = el.requestFullscreen || el.webkitRequestFullscreen
      const res = req ? req.call(el) : null
      if (res && typeof res.catch === 'function') res.catch(() => { /* denied - CSS overlay still covers it */ })
    } catch { /* CSS overlay already covers this - native API is a bonus, not a requirement */ }
  }
  async function exitFullscreen() {
    setFullscreen(false)
    try {
      const doc = document as any
      if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen()
      else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
    } catch { /* nothing to exit, or already exited (e.g. via Esc) */ }
  }
  // Esc closes the overlay even when native fullscreen isn't active (iOS
  // Safari, a denied request, embedded webviews) - in real fullscreen the
  // browser consumes Esc itself and the fullscreenchange listener below
  // takes over, so this is harmless there.
  useEffect(() => {
    if (!fullscreen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  // Keeps our state in sync if the browser's own fullscreen is dismissed
  // some other way (Esc key, swipe-down, OS gesture) so the overlay
  // doesn't stay stuck open behind a non-fullscreen window.
  useEffect(() => {
    function onFsChange() {
      const doc = document as any
      const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement)
      if (!isFs) setFullscreen(false)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  const {
    loading: sessionLoading,
    start: startRemoteSession,
    stop: stopRemoteSession,
  } = useFocusSession()

  // One-time catch-up: if the plan was left running and the tab/app was
  // closed or backgrounded, fast-forward the active task by real elapsed
  // time instead of silently losing (or freezing) its progress.
  useEffect(() => {
    if (didCatchUp.current) return
    didCatchUp.current = true
    if (!snapshot?.running || !snapshot.activeTaskId || !snapshot.runningStartedAtMs) return
    const elapsed = Math.max(0, Math.floor((Date.now() - snapshot.runningStartedAtMs) / 1000))
    if (elapsed <= 0) return
    setTasks(prev => prev.map(t => {
      if (t.id !== snapshot.activeTaskId) return t
      if (t.mode === 'pomodoro') return { ...t, pomodoroRemaining: Math.max(0, t.pomodoroRemaining - elapsed) }
      return { ...t, regularElapsed: t.regularElapsed + elapsed }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the segmented mode tab in sync with whichever task is actually
  // active, so it always reflects reality rather than a stale click.
  useEffect(() => {
    if (!activeTaskId) return
    const t = tasks.find(x => x.id === activeTaskId)
    if (t) setSelectedMode(t.mode)
  }, [activeTaskId, tasks])

  // Local 1s ticker for the active task only - Pomodoro counts down,
  // Regular counts up indefinitely.
  useEffect(() => {
    if (running && activeTaskId) {
      tickRef.current = setInterval(() => {
        setTasks(prev => prev.map(t => {
          if (t.id !== activeTaskId) return t
          if (t.mode === 'pomodoro') return { ...t, pomodoroRemaining: Math.max(0, t.pomodoroRemaining - 1) }
          return { ...t, regularElapsed: t.regularElapsed + 1 }
        }))
      }, 1000)
    } else if (tickRef.current) {
      clearInterval(tickRef.current)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [running, activeTaskId])

  // A Pomodoro task that hits 0 while running auto-completes (pauses)
  // rather than going negative or forcing a hard stop mid-render.
  useEffect(() => {
    if (!running || !activeTaskId) return
    const t = tasks.find(x => x.id === activeTaskId)
    if (t && t.mode === 'pomodoro' && t.pomodoroRemaining <= 0) {
      setRunning(false)
      stopRemoteSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, running, activeTaskId])

  // Persist the whole plan on every change so switching tabs/sections,
  // adding a task, or scrolling never has a chance to lose state, and a
  // refresh/relaunch can catch up on real elapsed time (see effect above).
  useEffect(() => {
    saveFocusPlanSnapshot({ tasks, activeTaskId, running, runningStartedAtMs: running ? Date.now() : null })
  }, [tasks, activeTaskId, running])

  const activeTask = tasks.find(t => t.id === activeTaskId) || null

  async function handleStartTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (running && activeTaskId && activeTaskId !== taskId) {
      // Only one live study_sessions row per user - starting a different
      // task means stopping (and logging) whatever was running before.
      await stopRemoteSession()
    }
    setActiveTaskId(taskId)
    setRunning(true)
    try { await startRemoteSession(task.subject) } catch { /* hook already falls back to a local-only clock */ }
  }

  async function handlePauseTask(taskId: string) {
    if (activeTaskId !== taskId || !running) return
    setRunning(false)
    await stopRemoteSession()
  }

  function handleRemoveTask(taskId: string) {
    if (activeTaskId === taskId) {
      setRunning(false)
      stopRemoteSession()
      setActiveTaskId(null)
    }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  function handleAddTask(subject: string, topic: string, mode: TimerMode) {
    const task: StudyTask = { id: makeTaskId(), subject, topic, mode, pomodoroRemaining: POMODORO_DEFAULT_SECS, regularElapsed: 0 }
    setTasks(prev => [task, ...prev])
    setShowAddTask(false)
  }

  // ── Main circle: mirrors the active task while one is running/paused;
  // otherwise previews whichever mode tab is selected. ──
  const isLiveRunning = running && !!activeTask
  let circleRemaining: number, circleTotal: number, circleTimeStr: string
  if (activeTask) {
    if (activeTask.mode === 'pomodoro') {
      circleRemaining = activeTask.pomodoroRemaining
      circleTotal = POMODORO_DEFAULT_SECS
      circleTimeStr = formatClock(activeTask.pomodoroRemaining)
    } else {
      // No fixed max for Regular - fill the ring once per hour purely as
      // a visual heartbeat; the digits themselves are still unbounded.
      const withinHour = activeTask.regularElapsed % 3600
      circleTotal = 3600
      circleRemaining = 3600 - withinHour
      circleTimeStr = formatClock(activeTask.regularElapsed, true)
    }
  } else if (selectedMode === 'pomodoro') {
    circleRemaining = POMODORO_DEFAULT_SECS
    circleTotal = POMODORO_DEFAULT_SECS
    circleTimeStr = formatClock(POMODORO_DEFAULT_SECS)
  } else {
    circleRemaining = 0
    circleTotal = 0 // TimerCircle treats total<=0 as "no progress yet" - an empty ring preview
    circleTimeStr = '00:00:00'
  }
  const circleCaption = activeTask ? (activeTask.mode === 'pomodoro' ? 'Study Time' : 'Studying') : (selectedMode === 'pomodoro' ? 'Focus • 25/5 • Repeat' : 'Count Up • No Limit')

  const headerStatus = sessionLoading
    ? 'Syncing…'
    : activeTask
      ? (running ? `● ${activeTask.subject} — ${activeTask.topic}` : '⏸ Paused')
      : 'Smarter focus. Bigger dreams.'

  const TimerModeIcon = ({ mode }: { mode: TimerMode }) => mode === 'pomodoro'
    ? <span>🍅</span>
    : <Ico n="clock" cls="w-5 h-5" />

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]">

      {/* ── Fullscreen overlay ──────────────────────────────────────────────
          True distraction-free view: only the timer, the active subject/
          topic, and an icon-only exit control. Clicking/tapping the timer
          itself toggles pause/resume - no extra button chrome on top. */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-[#020615]">
          <MountainBackdrop />

          {/* z-20 (not z-10): the content layer below is `relative z-10 h-full`, i.e.
              it covers the whole overlay and, with an equal z-index, paints OVER this
              button because it comes later in the DOM - swallowing every click. */}
          <button onClick={exitFullscreen} title="Exit fullscreen (Esc)" aria-label="Exit fullscreen"
            className="absolute top-6 right-6 z-20 w-11 h-11 rounded-full flex items-center justify-center text-xl text-slate-300 hover:text-white transition-colors bg-[rgba(255,255,255,0.06)] border border-[#1E3060]">
            <Ico n="compress" cls="w-5 h-5" />
          </button>

          <div className="relative z-10 h-full flex flex-col items-center justify-center gap-8 px-6">
            <button
              onClick={() => activeTask && (running ? handlePauseTask(activeTask.id) : handleStartTask(activeTask.id))}
              disabled={!activeTask}
              title={activeTask ? (running ? 'Tap to pause' : 'Tap to resume') : undefined}
              className="bg-transparent border-none p-0 disabled:cursor-default"
              style={{ width: 'min(440px, 62vh, 80vw)', aspectRatio: '1' }}>
              <TimerCircle remaining={circleRemaining} total={circleTotal} timeStr={circleTimeStr} running={isLiveRunning} size={440} />
            </button>
            {activeTask ? (
              <div className="text-center">
                <div className="text-base font-semibold text-slate-100">{activeTask.subject}</div>
                <div className="text-sm text-slate-500 mt-1">{activeTask.topic}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a task in My Study Plan to begin</div>
            )}
          </div>
        </div>
      )}

      <Sidebar active="focus" setActive={onNavigate} profile={profile} />

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <MountainBackdrop />

        {/* Header */}
        <header className="relative z-10 h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
          <button onClick={() => onNavigate('home')}
            className="flex items-center gap-1.5 text-sm transition-colors text-[#A5AEC2] hover:text-[#F3F4F6] mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.18em] mb-0.5 text-[#68728A]">FOCUS LOCK</div>
            <div className="text-sm font-semibold text-[#F3F4F6] truncate">{headerStatus}</div>
          </div>
          <UserAvatar size={32} />
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto px-5 sm:px-8 py-8">
          <div className="max-w-6xl mx-auto flex flex-col gap-8">

            {/* ── Timer mode selector ── */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <ModeTab active={selectedMode === 'pomodoro'} onClick={() => !activeTask && setSelectedMode('pomodoro')}
                icon={<TimerModeIcon mode="pomodoro" />} title="Pomodoro Timer" sub="Focus • 25/5 • Repeat" />
              <ModeTab active={selectedMode === 'regular'} onClick={() => !activeTask && setSelectedMode('regular')}
                icon={<TimerModeIcon mode="regular" />} title="Regular Timer" sub="Count Up • No Limit" />
            </div>

            {/* ── Main timer ── */}
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
                <TimerCircle remaining={circleRemaining} total={circleTotal} timeStr={circleTimeStr} running={isLiveRunning} size={280} />
                <button onClick={enterFullscreen} title="Fullscreen" aria-label="Enter fullscreen"
                  className="absolute -top-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all hover:opacity-90 active:scale-95 text-[#9B6CFF] bg-[rgba(124,77,255,0.10)] border border-[#1A2845]">
                  ⛶
                </button>
              </div>
              <div className="text-xs text-slate-500">{circleCaption}</div>
              {activeTask && (
                <button onClick={() => (running ? handlePauseTask(activeTask.id) : handleStartTask(activeTask.id))}
                  className="mt-2 h-11 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] px-8"
                  style={{ background: 'linear-gradient(135deg, #7C4DFF 0%, #6B44EE 100%)', boxShadow: '0 0 24px rgba(124,77,255,0.55), 0 0 48px rgba(40,85,204,0.25)' }}>
                  {running
                    ? <><svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>Pause</>
                    : <><Ico n="play" cls="w-4 h-4 flex-shrink-0" />Resume</>}
                </button>
              )}
            </div>

            {/* ── My Study Plan + Right column ── */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">

              {/* My Study Plan */}
              <div className="flex-1 min-w-0 w-full rounded-2xl border flex flex-col"
                style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Ico n="progress" cls="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-slate-100">My Study Plan</span>
                  </div>
                  <button onClick={() => setShowAddTask(true)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all hover:border-violet-400/40"
                    style={{ background: 'rgba(124,77,255,0.10)', borderColor: 'rgba(124,77,255,0.3)', color: '#C4AAFF' }}>
                    + Add Task
                  </button>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div className="text-2xl mb-2">📋</div>
                      <div className="text-xs text-slate-500">No study tasks yet.<br />Add your first subject + topic to start a timer.</div>
                    </div>
                  ) : tasks.map(task => (
                    <StudyPlanRow key={task.id} task={task} isActive={task.id === activeTaskId} running={running}
                      onStart={() => handleStartTask(task.id)}
                      onPause={() => handlePauseTask(task.id)}
                      onRemove={() => handleRemoveTask(task.id)} />
                  ))}
                </div>
              </div>

              {/* Right column: Current Focus + Quick Notes */}
              <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
                <CurrentFocusPanel task={activeTask} />
                <QuickNotesPanel />
              </div>
            </div>
          </div>
        </main>
      </div>

      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} onAdd={handleAddTask} />}
    </div>
  )
}

// ─── Study Rooms Page ─────────────────────────────────────────────────────────

interface RoomData {
  id: number; name: string; emoji: string; classes: string; subject: string
  desc: string; members: number; avatarColors: string[]; avatarInits: string[]
  iconBg: string; iconEmoji: string; tag: 'popular' | 'all' | 'myrooms'
  isPublic: boolean; password?: string; isUserCreated?: boolean; isOwner?: boolean
  subjectTag: string
}

interface BotParticipant {
  id: string; name: string; initials: string; subject: string
  studyTimeSecs: number; isStudying: boolean; isPaused?: boolean; cardGrad: string; accentColor: string
  isMe?: boolean
}

interface ChatMsg {
  id: string; name: string; text: string; time: string; isBot: boolean; isMe: boolean
}

const ROOM_DATA: RoomData[] = [
  {
    id: 1, name: 'Physics Warriors', emoji: '⚡', classes: 'Class 11 · 12', subject: 'Physics',
    desc: 'Concepts, PYQs, doubts — all in one place.', members: 48,
    avatarColors: ['#7C4DFF', '#9B6CFF', '#EC4899', '#F59E0B'],
    avatarInits: ['RS', 'PK', 'AM', 'DJ'],
    iconBg: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
    iconEmoji: '📘', tag: 'popular', subjectTag: 'physics', isPublic: true,
  },
  {
    id: 2, name: 'Chemistry Crew', emoji: '✨', classes: 'Class 11 · 12', subject: 'Chemistry',
    desc: 'Study. Discuss. Score.', members: 32,
    avatarColors: ['#7C4DFF', '#0F99CC', '#EC4899', '#F87171'],
    avatarInits: ['SK', 'DL', 'MK', 'RV'],
    iconBg: 'linear-gradient(135deg, #7C4DFF, #A855F7)',
    iconEmoji: '🧪', tag: 'popular', subjectTag: 'chemistry', isPublic: true,
  },
  {
    id: 3, name: 'Maths Mavericks', emoji: '', classes: 'Class 10 · 11 · 12', subject: 'Mathematics',
    desc: 'Tricks, practice, progress.', members: 67,
    avatarColors: ['#0DAE86', '#3B82F6', '#F59E0B', '#F97316'],
    avatarInits: ['AK', 'KV', 'PN', 'SR'],
    iconBg: 'linear-gradient(135deg, #0C7FAA, #19B5E6)',
    iconEmoji: '√x', tag: 'popular', subjectTag: 'maths', isPublic: true,
  },
  {
    id: 4, name: 'Biology Buddies', emoji: '🌿', classes: 'Class 11 · 12', subject: 'Biology',
    desc: 'Learn, revise, ace.', members: 41,
    avatarColors: ['#0A9673', '#7C4DFF', '#F59E0B', '#EC4899'],
    avatarInits: ['VM', 'PR', 'SC', 'AT'],
    iconBg: 'linear-gradient(135deg, #0A9673, #19D3A2)',
    iconEmoji: '📗', tag: 'all', subjectTag: 'biology', isPublic: false, password: 'bio123',
  },
  {
    id: 5, name: 'JEE 2026', emoji: '👑', classes: 'JEE Aspirants', subject: 'All Subjects',
    desc: 'Discipline. Consistency. Results.', members: 89,
    avatarColors: ['#DC2626', '#7C4DFF', '#0F99CC', '#F59E0B'],
    avatarInits: ['RK', 'AS', 'PG', 'NM'],
    iconBg: 'linear-gradient(135deg, #BE185D, #F43F5E)',
    iconEmoji: '🎯', tag: 'popular', subjectTag: 'all', isPublic: false, password: 'jee2026',
  },
  {
    id: 6, name: 'Night Owls', emoji: '🌙', classes: 'All Classes', subject: 'All Subjects',
    desc: 'Late night study sessions. No distractions.', members: 27,
    avatarColors: ['#1D4ED8', '#7C4DFF', '#9B6CFF', '#0F99CC'],
    avatarInits: ['LD', 'VR', 'AM', 'TR'],
    iconBg: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
    iconEmoji: '💻', tag: 'all', subjectTag: 'all', isPublic: true,
  },
  {
    id: 7, name: 'Class 12 Board Prep', emoji: '', classes: 'Class 12', subject: 'All Subjects',
    desc: "Let's crack it together!", members: 56,
    avatarColors: ['#7C4DFF', '#0DAE86', '#F59E0B', '#EC4899'],
    avatarInits: ['HP', 'GS', 'RT', 'MV'],
    iconBg: 'linear-gradient(135deg, #5835CC, #7C4DFF)',
    iconEmoji: '👥', tag: 'all', subjectTag: 'all', isPublic: true,
  },
  {
    id: 8, name: 'Productive Humans', emoji: '✨', classes: 'All Classes', subject: 'All Subjects',
    desc: 'Better habits. Bigger dreams.', members: 73,
    avatarColors: ['#7C4DFF', '#3B82F6', '#EC4899', '#19D3A2'],
    avatarInits: ['KD', 'PS', 'YR', 'NB'],
    iconBg: 'linear-gradient(135deg, #5C35CC, #7C4DFF)',
    iconEmoji: '✦', tag: 'all', subjectTag: 'all', isPublic: true,
  },
]

// ─── Bot Pool ─────────────────────────────────────────────────────────────────
const BOT_POOL = [
  { name: 'Riya', initials: 'RI', cardGrad: 'linear-gradient(160deg,#0F1729,#1E1244,#2A1860)', accentColor: '#9B6CFF', isStudying: true },
  { name: 'Arjun', initials: 'AR', cardGrad: 'linear-gradient(160deg,#0D2030,#0E3355,#0C4A7A)', accentColor: '#19B5E6', isStudying: true },
  { name: 'Meera', initials: 'ME', cardGrad: 'linear-gradient(160deg,#1A0F28,#2D124A,#3D155C)', accentColor: '#A855F7', isStudying: true },
  { name: 'Dev', initials: 'DE', cardGrad: 'linear-gradient(160deg,#0F1A20,#122A38,#0E3A50)', accentColor: '#19B5E6', isStudying: true },
  { name: 'Anshul', initials: 'AN', cardGrad: 'linear-gradient(160deg,#15101E,#251540,#1E1060)', accentColor: '#7C4DFF', isStudying: true },
  { name: 'Nain', initials: 'NA', cardGrad: 'linear-gradient(160deg,#0F1520,#1B2A3C,#223650)', accentColor: '#3B82F6', isStudying: false },
  { name: 'Adarsh', initials: 'AD', cardGrad: 'linear-gradient(160deg,#1A0F15,#2E1228,#3D1535)', accentColor: '#EC4899', isStudying: true },
  { name: 'Jatin', initials: 'JA', cardGrad: 'linear-gradient(160deg,#18101E,#2A1540,#371260)', accentColor: '#9B6CFF', isStudying: true },
]

function getRoomBots(room: RoomData): BotParticipant[] {
  if (room.isUserCreated) return []
  const count = 3 + (room.id % 3)
  const subjects = room.subject === 'All Subjects'
    ? ['Physics', 'Chemistry', 'Mathematics', 'Biology']
    : [`${room.subject}`, `${room.subject} — Advanced`, `${room.subject} — PYQs`]
  return BOT_POOL.slice(0, count).map((b, i) => ({
    ...b,
    id: `bot-${room.id}-${i}`,
    subject: subjects[i % subjects.length],
    studyTimeSecs: b.isStudying ? (30 + ((room.id * 17 + i * 23) % 120)) * 60 : 0,
  }))
}

function getInitialChat(room: RoomData): ChatMsg[] {
  const bots = getRoomBots(room).filter(b => b.isStudying)
  if (bots.length === 0) return []
  return [
    { id: '1', name: bots[0]?.name || 'Riya', text: 'Starting my session now! 💪', time: '9:42 AM', isBot: true, isMe: false },
    { id: '2', name: bots[1]?.name || 'Arjun', text: "Good luck everyone! Let's crush it.", time: '9:43 AM', isBot: true, isMe: false },
    { id: '3', name: bots[0]?.name || 'Riya', text: 'Focus mode on 🎯', time: '9:45 AM', isBot: true, isMe: false },
  ]
}

// ─── Room Icon + Face Avatars ─────────────────────────────────────────────────
type RoomTab = 'all' | 'myrooms' | 'popular' | 'subject'
const SUBJECT_FILTER_TABS = ['All Subjects', 'Physics', 'Chemistry', 'Mathematics', 'Biology']

function RoomIcon({ bg, emoji }: { bg: string; emoji: string }) {
  return (
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-bold text-xl select-none"
      style={{ background: bg, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
      {emoji}
    </div>
  )
}

function FaceAvatars({ colors, inits }: { colors: string[]; inits: string[] }) {
  return (
    <div className="flex -space-x-2">
      {colors.slice(0, 4).map((c, i) => (
        <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 flex-shrink-0"
          style={{ background: c, borderColor: '#0B1530', zIndex: 4 - i }}>
          {inits[i]}
        </div>
      ))}
    </div>
  )
}

// ─── Studying Avatar (anime-style card) ───────────────────────────────────────
function StudyingAvatar({ cardGrad, accentColor }: { cardGrad: string; accentColor: string }) {
  return (
    <div className="relative h-40 overflow-hidden" style={{ background: cardGrad }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 110%, ${accentColor}25, transparent 65%)` }} />
      <div className="absolute bottom-6 right-6 w-14 h-14 rounded-full opacity-20 pointer-events-none"
        style={{ background: accentColor, filter: 'blur(18px)' }} />
      <svg viewBox="0 0 120 155" className="absolute bottom-0 left-1/2" style={{ transform: 'translateX(-50%)' }} width="90" height="116">
        <path d="M 35 155 L 35 100 Q 35 88 48 85 L 60 82 L 72 85 Q 85 88 85 100 L 85 155 Z" fill={`${accentColor}18`} />
        <rect x="54" y="76" width="12" height="10" rx="3" fill={`${accentColor}28`} />
        <ellipse cx="60" cy="62" rx="19" ry="21" fill={`${accentColor}32`} />
        <ellipse cx="60" cy="46" rx="20" ry="13" fill={`${accentColor}48`} />
        <rect x="40" y="46" width="5" height="15" rx="2.5" fill={`${accentColor}48`} />
        <rect x="75" y="46" width="5" height="15" rx="2.5" fill={`${accentColor}48`} />
        <ellipse cx="52" cy="65" rx="2.5" ry="2" fill={`${accentColor}55`} />
        <ellipse cx="68" cy="65" rx="2.5" ry="2" fill={`${accentColor}55`} />
        <path d="M 41,60 Q 39,42 60,40 Q 81,42 79,60" stroke={accentColor} strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.78" />
        <ellipse cx="40" cy="62" rx="6" ry="8" fill={accentColor} opacity="0.78" />
        <ellipse cx="80" cy="62" rx="6" ry="8" fill={accentColor} opacity="0.78" />
        <ellipse cx="40" cy="62" rx="3" ry="4.5" fill="rgba(0,0,0,0.5)" />
        <ellipse cx="80" cy="62" rx="3" ry="4.5" fill="rgba(0,0,0,0.5)" />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 h-14"
        style={{ background: 'linear-gradient(to top, rgba(8,10,18,0.95), transparent)' }} />
    </div>
  )
}

// ─── Mic Off Icon ─────────────────────────────────────────────────────────────
function MicOffIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
      <rect x="5.25" y="1" width="5.5" height="8.5" rx="2.75" />
      <path d="M3 7c0 2.76 2.24 5 5 5s5-2.24 5-5" />
      <line x1="8" y1="12" x2="8" y2="14.5" />
      <line x1="5.5" y1="14.5" x2="10.5" y2="14.5" />
      <line x1="2" y1="2" x2="14" y2="14" />
    </svg>
  )
}

// ─── Bot Card ─────────────────────────────────────────────────────────────────
function BotCard({ bot, canKick, onKick, avatarUrl }: { bot: BotParticipant; canKick?: boolean; onKick?: () => void; avatarUrl?: string }) {
  const fmtTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
  }
  // While actually live, show a real ticking clock (H:MM:SS / MM:SS) so the
  // card visibly counts up second-by-second -- a rounded "0m" for the first
  // minute reads as broken/frozen. Once paused or offline, fall back to the
  // coarser "Xh Ym" style every other card here uses.
  const fmtLiveTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
  }
  // Three real states, not a binary studying flag: live (clock running right
  // now), paused (clock stopped but time was already banked this session),
  // offline (never started, or a bot marked not-studying).
  const state: 'live' | 'paused' | 'offline' =
    bot.isStudying ? 'live' : (bot.isPaused && bot.studyTimeSecs > 0) ? 'paused' : 'offline'

  if (state === 'offline') {
    return (
      <div className="rounded-2xl border overflow-hidden bg-[#020615] border-[rgba(100,116,139,0.12)]">
        <div className="h-40 flex flex-col items-center justify-center gap-2"
          style={{ background: 'linear-gradient(160deg,#0A0D18,#0D1120)' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={bot.name} className="w-12 h-12 rounded-full object-cover grayscale opacity-60" />
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-slate-500 font-bold text-base"
              style={{ background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.12)' }}>
              {bot.initials}
            </div>
          )}
          <div className="text-[10px] text-slate-600 font-mono">offline</div>
        </div>
        <div className="p-3 border-t border-[rgba(100,116,139,0.1)]">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-600" /><span className="text-slate-400 font-semibold text-sm">{bot.name}</span></div>
          <div className="text-xs text-slate-500 mt-0.5">{bot.subject}</div>
        </div>
      </div>
    )
  }

  const isLive = state === 'live'
  const dotColor = isLive ? 'bg-emerald-400' : 'bg-amber-400'
  const statusLabel = isLive ? null : 'Paused'

  return (
    <div className="rounded-2xl border overflow-hidden relative bg-[#020615]" style={{ borderColor: `${bot.accentColor}${isLive ? '30' : '18'}` }}>
      {avatarUrl ? (
        <div className="relative h-40 overflow-hidden" style={{ background: bot.cardGrad }}>
          <img src={avatarUrl} alt={bot.name}
            className={`absolute inset-0 w-full h-full object-cover ${isLive ? '' : 'grayscale opacity-70'}`} />
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 110%, ${bot.accentColor}25, transparent 65%)` }} />
          <div className="absolute bottom-0 left-0 right-0 h-14"
            style={{ background: 'linear-gradient(to top, rgba(8,10,18,0.9), transparent)' }} />
        </div>
      ) : (
        <StudyingAvatar cardGrad={bot.cardGrad} accentColor={bot.accentColor} />
      )}
      <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <MicOffIcon />
      </div>
      {canKick && (
        <button onClick={onKick}
          className="absolute top-2.5 left-2.5 text-[9px] px-2 py-0.5 rounded-full transition-all hover:bg-red-500/20"
          style={{ background: 'rgba(0,0,0,0.4)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}>
          Kick
        </button>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-0.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor} ${isLive ? 'animate-pulse' : ''}`} />
          <span className="text-white font-semibold text-sm">{bot.name}</span>
          {statusLabel && <span className="text-[9px] font-mono text-amber-400/80 tracking-wide">{statusLabel}</span>}
        </div>
        <div className="text-xs text-slate-400">{bot.subject}</div>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
          <Ico n="clock" cls="w-3 h-3" />{isLive ? fmtLiveTime(bot.studyTimeSecs) : fmtTime(bot.studyTimeSecs)}
        </div>
      </div>
    </div>
  )
}

// ─── Study Rooms List Page ─────────────────────────────────────────────────────
function StudyRoomsPage({ onNavigate, onEnterRoom, profile }: {
  onNavigate: (id: string) => void
  onEnterRoom: (room: RoomData) => void
  profile?: ProfileInfo
}) {
  const [tab, setTab] = useState<RoomTab>('all')
  const [subjectFilter, setSubjectFilter] = useState('All Subjects')
  const [search, setSearch] = useState('')
  const [joinedIds, setJoinedIds] = useState<Set<number>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [passwordRoomId, setPasswordRoomId] = useState<number | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [inviteRoom, setInviteRoom] = useState<RoomData | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [userRooms, setUserRooms] = useState<RoomData[]>([])
  const [createForm, setCreateForm] = useState({ name: '', subject: '', desc: '', isPublic: true, password: '' })

  const allRooms = [...ROOM_DATA, ...userRooms]
  const filtered = allRooms.filter(r => {
    if (tab === 'popular') return r.tag === 'popular' && !r.isUserCreated
    if (tab === 'myrooms') return !!r.isUserCreated
    if (tab === 'subject') {
      if (subjectFilter !== 'All Subjects' && r.subject !== subjectFilter && r.subject !== 'All Subjects') return false
    }
    if (search) {
      const q = search.toLowerCase()
      return r.name.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q)
    }
    return true
  })

  const TABS: { id: RoomTab; label: string; icon: string }[] = [
    { id: 'all', label: 'All Rooms', icon: '👥' },
    { id: 'myrooms', label: 'My Rooms', icon: '👤' },
    { id: 'popular', label: 'Popular', icon: '🔥' },
    { id: 'subject', label: 'Subject Wise', icon: '📚' },
  ]

  function handleJoin(room: RoomData) {
    if (joinedIds.has(room.id)) return
    if (!room.isPublic) { setPasswordRoomId(room.id); setPasswordInput(''); setPasswordError(false) }
    else setJoinedIds(prev => { const s = new Set(prev); s.add(room.id); return s })
  }

  function submitPassword() {
    const room = allRooms.find(r => r.id === passwordRoomId)
    if (!room) return
    if (passwordInput === room.password) {
      setJoinedIds(prev => { const s = new Set(prev); s.add(room.id); return s })
      setPasswordRoomId(null)
    } else { setPasswordError(true) }
  }

  function handleLeave(id: number) {
    setJoinedIds(prev => { const s = new Set(prev); s.delete(id); return s })
    setOpenMenuId(null)
  }

  function handleCreateRoom() {
    if (!createForm.name.trim()) return
    const newRoom: RoomData = {
      id: Date.now(), name: createForm.name.trim(), emoji: '', classes: 'All Classes',
      subject: createForm.subject.trim() || 'All Subjects', desc: createForm.desc.trim() || 'Custom study room.',
      members: 1, avatarColors: ['#7C4DFF'], avatarInits: ['AS'],
      iconBg: 'linear-gradient(135deg, #7C4DFF, #6B44EE)', iconEmoji: '✦',
      tag: 'myrooms', isPublic: createForm.isPublic, password: createForm.isPublic ? undefined : createForm.password,
      isUserCreated: true, isOwner: true, subjectTag: 'all',
    }
    setUserRooms(prev => [...prev, newRoom])
    setJoinedIds(prev => { const s = new Set(prev); s.add(newRoom.id); return s })
    setShowCreate(false)
    setCreateForm({ name: '', subject: '', desc: '', isPublic: true, password: '' })
  }

  function copyInviteLink(room: RoomData) {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]" 
      onClick={() => setOpenMenuId(null)}>
      <Sidebar active="studyrooms" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" >STUDY ROOMS</div>
            <div className="text-sm font-semibold text-slate-200">Find your people. Focus better.</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {/* Hero */}
          <div className="flex items-start justify-between mb-6 gap-6">
            <div>
              <div className="text-[10px] font-mono tracking-[0.22em] text-slate-500 mb-2">STUDY TOGETHER · GROW TOGETHER</div>
              <h1 className="text-4xl font-bold leading-tight mb-2 text-white">
                Study <span style={{ background: 'linear-gradient(90deg,#7C4DFF,#A855F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Rooms</span>
              </h1>
              <p className="text-slate-400 text-sm">Find your people. Focus better.</p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex-shrink-0 flex items-center gap-4 p-5 rounded-2xl border relative overflow-hidden hover:scale-[1.02] transition-transform"
              style={{ background: 'linear-gradient(135deg,#2D1B69,#1E3A8A)', borderColor: '#4A3A88', minWidth: '240px', boxShadow: '0 0 40px #1A2845' }}>
              <div className="absolute top-2 right-8 text-2xl opacity-30 select-none">✦</div>
              <div className="absolute top-5 right-4 text-sm opacity-20 select-none">✦</div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#7C4DFF', boxShadow: '0 0 20px #4A3A88' }}>
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-bold text-base leading-tight">Create Your<br />Study Room</div>
                <div className="text-[11px] text-slate-400 mt-1">Set your rules, invite<br />friends, or go public.</div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <Ico n="chevR" cls="w-4 h-4 text-white" />
              </div>
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border mb-5 bg-[#0B1530] border-[#1A2845]"
            >
            <Ico n="search" cls="w-4 h-4 text-slate-500 flex-shrink-0" />
            <input className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600"
              placeholder="Search study rooms..." value={search} onChange={e => setSearch(e.target.value)} />
            <kbd className="text-[11px] text-slate-600 border rounded px-1.5 py-0.5 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]"
              >⌘ K</kbd>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  background: tab === t.id ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : '#0B1530',
                  color: tab === t.id ? '#fff' : '#8B9AC7',
                  border: `1px solid ${tab === t.id ? '#563FA0' : '#1A2845'}`,
                  boxShadow: tab === t.id ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
                }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {tab === 'subject' && (
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {SUBJECT_FILTER_TABS.map(s => (
                <button key={s} onClick={() => setSubjectFilter(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border"
                  style={{
                    background: subjectFilter === s ? '#1A2845' : 'transparent',
                    color: subjectFilter === s ? '#C4AAFF' : '#4E5E84',
                    borderColor: subjectFilter === s ? '#4A3A88' : 'rgba(26,40,69,0.55)',
                  }}>{s}</button>
              ))}
            </div>
          )}

          {tab === 'myrooms' && filtered.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🏠</div>
              <div className="text-slate-300 font-semibold mb-1">No rooms yet</div>
              <div className="text-slate-500 text-sm mb-4">Create your first study room to see it here.</div>
              <button onClick={() => setShowCreate(true)}
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 bg-[#7C4DFF]"
                >Create Room</button>
            </div>
          )}

          <div className="space-y-3 pb-8">
            {filtered.map(room => {
              const joined = joinedIds.has(room.id)
              const menuOpen = openMenuId === room.id
              return (
                <div key={room.id}
                  className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:border-violet-500/40 relative"
                  style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                  <RoomIcon bg={room.iconBg} emoji={room.iconEmoji} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-bold text-white text-base">{room.name}</span>
                      {room.emoji && <span>{room.emoji}</span>}
                      {!room.isPublic && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono flex items-center gap-1"
                          style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}>
                          🔒 Private
                        </span>
                      )}
                      {room.isPublic && !room.isUserCreated && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                          style={{ background: 'rgba(25,211,162,0.08)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.20)' }}>
                          Public
                        </span>
                      )}
                      {room.tag === 'popular' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}>HOT</span>
                      )}
                      {room.isOwner && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                          style={{ background: 'rgba(26,40,69,0.55)', color: '#9B6CFF', border: '1px solid #1E3060' }}>Owner</span>
                      )}
                    </div>
                    <div className="text-[12px] text-slate-400 mb-1" >
                      {room.classes} &nbsp;|&nbsp; {room.subject}
                    </div>
                    <div className="text-sm text-slate-300 mb-3">{room.desc}</div>
                    <div className="flex items-center gap-2">
                      <FaceAvatars colors={room.avatarColors} inits={room.avatarInits} />
                      <span className="text-[12px] text-slate-400 font-mono">+{room.members}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* ⋮ menu */}
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : room.id) }}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
                        <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                          <circle cx="10" cy="5" r="1.2" /><circle cx="10" cy="10" r="1.2" /><circle cx="10" cy="15" r="1.2" />
                        </svg>
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border z-20 overflow-hidden"
                          onClick={e => e.stopPropagation()}
                          style={{ background: '#0B1530', borderColor: '#1E3060', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                          <button onClick={() => { setInviteRoom(room); setOpenMenuId(null) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-violet-500/10 hover:text-violet-200 transition-colors flex items-center gap-2">
                            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-4l2 2-2 2M14 8H7" /></svg>
                            Invite Friends
                          </button>
                          {joined && (
                            <button onClick={() => handleLeave(room.id)}
                              className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 border-t border-[rgba(26,40,69,0.55)]"
                              >
                              <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M17 10H7m0 0l3-3m-3 3l3 3M3 17V3" /></svg>
                              Leave Room
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Join / Enter */}
                    {joined ? (
                      <button onClick={() => onEnterRoom(room)}
                        className="px-5 py-2 rounded-full font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
                        style={{ background: '#7C4DFF', color: '#fff', boxShadow: '0 0 18px rgba(40,85,204,0.6)' }}>
                        Enter →
                      </button>
                    ) : (
                      <button onClick={() => handleJoin(room)}
                        className="px-5 py-2 rounded-full font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
                        style={{ background: '#7C4DFF', color: '#fff', boxShadow: '0 0 18px rgba(40,85,204,0.6)' }}>
                        {room.isPublic ? 'Join' : '🔒 Join'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {/* Password Modal */}
      {passwordRoomId !== null && (() => {
        const room = allRooms.find(r => r.id === passwordRoomId)!
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]" 
            onClick={e => { if (e.target === e.currentTarget) setPasswordRoomId(null) }}>
            <div className="rounded-2xl border p-8 w-[360px]"
              style={{ background: '#0B1530', borderColor: 'rgba(245,158,11,0.35)', boxShadow: '0 0 60px rgba(245,158,11,0.1)' }}>
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">🔒</div>
                <div className="text-[10px] text-amber-400 font-mono tracking-[0.2em] mb-1">PRIVATE ROOM</div>
                <div className="text-lg font-bold text-white">{room.name}</div>
                <div className="text-sm text-slate-400 mt-1">Enter the room password to join</div>
              </div>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 mb-1 text-center tracking-widest transition-colors"
                style={{ borderColor: passwordError ? 'rgba(248,113,113,0.5)' : '#1E3060', fontSize: '18px', letterSpacing: '4px' }}
                placeholder="••••••"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
                onKeyDown={e => e.key === 'Enter' && submitPassword()}
                autoFocus
              />
              {passwordError && <div className="text-[11px] text-red-400 text-center mb-3">Incorrect password. Try again.</div>}
              {!passwordError && <div className="h-4 mb-1" />}
              <div className="flex gap-3">
                <button onClick={() => setPasswordRoomId(null)}
                  className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]"
                  >Cancel</button>
                <button onClick={submitPassword}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                  Enter Room
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Invite Modal */}
      {inviteRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]" 
          onClick={e => { if (e.target === e.currentTarget) setInviteRoom(null) }}>
          <div className="rounded-2xl border p-8 w-[400px]"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 50px rgba(124,77,255,0.3), 0 0 100px rgba(40,85,204,0.12)' }}>
            <div className="text-center mb-5">
              <div className="text-2xl mb-2">🔗</div>
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">INVITE TO ROOM</div>
              <div className="text-lg font-bold text-white">{inviteRoom.name}</div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-xs text-slate-400">{inviteRoom.isPublic ? '🌐 Public Room' : '🔒 Private Room'}</span>
              </div>
            </div>
            <div className="mb-4">
              <div className="text-[11px] text-slate-500 mb-1.5 font-mono">INVITE LINK</div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-[#0B1530] border-[#1A2845]"
                >
                <span className="flex-1 text-sm text-violet-300 truncate" >
                  wynko.app/rooms/{inviteRoom.name.toLowerCase().replace(/\s+/g, '-')}
                </span>
                <button onClick={() => copyInviteLink(inviteRoom)}
                  className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex-shrink-0"
                  style={{ background: copied ? 'rgba(25,211,162,0.15)' : 'rgba(26,40,69,0.55)', color: copied ? '#19D3A2' : '#9B6CFF', border: `1px solid ${copied ? 'rgba(25,211,162,0.30)' : '#1E3060'}` }}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            {!inviteRoom.isPublic && (
              <div className="mb-4 p-3 rounded-xl border bg-[rgba(245,158,11,0.07)] border-[rgba(245,158,11,0.2)]"
                >
                <div className="text-[11px] text-amber-400 font-mono mb-1">ROOM PASSWORD</div>
                <div className="text-sm text-amber-300">Share the password separately with your friends.</div>
              </div>
            )}
            <div className="flex gap-2">
              {[{ icon: '💬', label: 'WhatsApp' }, { icon: '✈️', label: 'Telegram' }, { icon: '📧', label: 'Email' }].map(opt => (
                <button key={opt.label}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs text-slate-300 hover:text-white transition-colors border-[#1A2845] bg-[#0B1530]"
                  >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setInviteRoom(null)}
              className="w-full mt-3 py-2 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[rgba(26,40,69,0.55)]"
              >Close</button>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]" 
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="rounded-2xl border p-7 w-[420px]"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(40,85,204,0.6), 0 0 40px rgba(124,77,255,0.2)' }}>
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-0.5">CREATE STUDY ROOM</div>
              <div className="text-lg font-bold text-white">Set up your room</div>
            </div>
            <div className="space-y-3 mb-5">
              <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                 placeholder="Room name *" />
              <input value={createForm.subject} onChange={e => setCreateForm(f => ({ ...f, subject: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                 placeholder="Subject (e.g. Physics, JEE)" />
              <textarea value={createForm.desc} onChange={e => setCreateForm(f => ({ ...f, desc: e.target.value }))}
                rows={2} className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 resize-none focus:border-violet-500/50 transition-colors border-[#1A2845]"
                 placeholder="Short description..." />
              {/* Public / Private toggle */}
              <div className="flex gap-2">
                <button onClick={() => setCreateForm(f => ({ ...f, isPublic: true }))}
                  className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-all"
                  style={{ background: createForm.isPublic ? 'rgba(25,211,162,0.10)' : 'transparent', color: createForm.isPublic ? '#19D3A2' : '#4E5E84', borderColor: createForm.isPublic ? 'rgba(25,211,162,0.40)' : '#1A2845' }}>
                  🌐 Public
                </button>
                <button onClick={() => setCreateForm(f => ({ ...f, isPublic: false }))}
                  className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-all"
                  style={{ background: !createForm.isPublic ? 'rgba(245,158,11,0.1)' : 'transparent', color: !createForm.isPublic ? '#F59E0B' : '#4E5E84', borderColor: !createForm.isPublic ? 'rgba(245,158,11,0.4)' : '#1A2845' }}>
                  🔒 Private
                </button>
              </div>
              {!createForm.isPublic && (
                <input value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  type="password"
                  className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-amber-500/50 transition-colors border-[rgba(245,158,11,0.3)]"
                   placeholder="Set room password" />
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]"
                >Cancel</button>
              <button onClick={handleCreateRoom}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Room Interior Page ────────────────────────────────────────────────────────
function RoomInteriorPage({ room, onBack, onNavigate, profile }: {
  room: RoomData; onBack: () => void; onNavigate: (id: string) => void; profile?: ProfileInfo
}) {
  const { avatar: userAvatar } = useContext(UserAvatarCtx)
  const bots = getRoomBots(room)
  const [focusRunning, setFocusRunning] = useState(false)
  const [focusTotal] = useState(25 * 60)
  const [focusRemaining, setFocusRemaining] = useState(25 * 60)
  const [activeTab, setActiveTab] = useState<'studying' | 'chat'>('studying')
  const [subject, setSubject] = useState(room.subject === 'All Subjects' ? 'Physics' : room.subject)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>(getInitialChat(room))
  const [botTimes, setBotTimes] = useState(bots.map(b => b.studyTimeSecs))
  const [userStudyTime, setUserStudyTime] = useState(0)
  const [kickedIds, setKickedIds] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusRunning) {
      timerRef.current = setInterval(() => {
        setFocusRemaining(prev => {
          if (prev <= 1) { setFocusRunning(false); return 0 }
          return prev - 1
        })
        setUserStudyTime(p => p + 1)
        setBotTimes(prev => prev.map((t, i) => bots[i]?.isStudying ? t + 1 : t))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [focusRunning])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const chatLocked = focusRunning

  const f2 = (n: number) => String(n).padStart(2, '0')
  const fh = Math.floor(focusRemaining / 3600)
  const fm = Math.floor((focusRemaining % 3600) / 60)
  const fs = focusRemaining % 60
  const timeStr = fh > 0 ? `${f2(fh)}:${f2(fm)}:${f2(fs)}` : `${f2(fm)}:${f2(fs)}`
  const fmtStudyTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${f2(m)}m` : `${m}m`
  }

  const visibleBots = bots.filter(b => !kickedIds.has(b.id))
  const studyingCount = visibleBots.filter(b => b.isStudying).length + (focusRunning || userStudyTime > 0 ? 1 : 0)

  function sendMessage() {
    const txt = chatInput.trim()
    if (!txt) return
    const now = new Date()
    setMessages(prev => [...prev, {
      id: String(Date.now()), name: 'You', text: txt,
      time: `${now.getHours()}:${f2(now.getMinutes())}`, isBot: false, isMe: true
    }])
    setChatInput('')
  }

  const selfName = profile?.displayName || 'Jatin Sinsinwar'
  const selfInitials = selfName.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'JS'

  const userCard: BotParticipant = {
    id: 'user', name: `You (${selfName.split(/\s+/)[0]})`, initials: selfInitials, subject,
    studyTimeSecs: userStudyTime,
    // Live only while the clock is actually running; paused (not offline)
    // once time's been banked but the play/pause button has been toggled
    // off — the card should track the real button, not just "> 0 secs".
    isStudying: focusRunning,
    isPaused: !focusRunning && userStudyTime > 0,
    cardGrad: 'linear-gradient(160deg,#1A0F35,#2D1555,#3D1870)',
    accentColor: '#7C4DFF',
  }

  const allParticipants = [userCard, ...visibleBots]

  return (
    <div className="flex h-screen overflow-hidden bg-[#060914]" >
      <Sidebar active="studyrooms" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center px-6 gap-3 border-b flex-shrink-0 bg-[rgba(6,9,20,0.95)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm flex-shrink-0">
            <Ico n="chevL" cls="w-4 h-4" /> Rooms
          </button>
          <div className="w-px h-5 bg-slate-700 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-mono">Live Now</span>
          </div>
          <span className="text-slate-200 font-semibold text-sm truncate">{room.name} {room.emoji}</span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-slate-400 text-sm flex-shrink-0">
            <Ico n="rooms" cls="w-4 h-4" />
            <span className="text-slate-300 font-mono text-sm">{studyingCount} studying</span>
          </div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Focus timer card */}
          <div className="mx-5 mt-4 mb-3 p-5 rounded-2xl border relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0B1530,#0F1845)', borderColor: '#1E3060', boxShadow: '0 0 40px rgba(124,77,255,0.25), 0 0 80px rgba(40,85,204,0.1)' }}>
            {/* Background wave */}
            <div className="absolute right-0 top-0 bottom-0 w-48 opacity-20 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at right center,#7C4DFF,transparent 70%)' }} />
            <div className="flex items-center gap-6 relative">
              {/* Circular ring + play/pause */}
              <div className="flex-shrink-0 relative" style={{ width: 88, height: 88 }}>
                <svg viewBox="0 0 88 88" width="88" height="88">
                  <defs>
                    <linearGradient id="rg2" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7C4DFF" /><stop offset="100%" stopColor="#60A5FA" />
                    </linearGradient>
                    <filter id="rf2"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                  <circle cx="44" cy="44" r="36" fill="none" stroke="url(#rg2)" strokeWidth="6"
                    strokeLinecap="round" filter="url(#rf2)"
                    strokeDasharray={`${(1 - focusRemaining / focusTotal) * 226.2} 226.2`}
                    transform="rotate(-90 44 44)" />
                  <circle cx="44" cy="44" r="30" fill="rgba(13,17,48,0.9)" />
                </svg>
                <button
                  onClick={() => setFocusRunning(r => !r)}
                  className="absolute inset-0 flex items-center justify-center rounded-full transition-all hover:scale-105">
                  {focusRunning ? (
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>
                  )}
                </button>
              </div>
              {/* Timer info */}
              <div className="flex-1">
                <div className="text-[11px] text-slate-400 mb-0.5 font-mono tracking-wide">Focus Time</div>
                <div className="text-4xl font-bold text-white mb-2" style={{ textShadow: '0 0 20px #4A3A88' }}>
                  {timeStr}
                </div>
                {/* Subject pill */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer hover:border-violet-400/40 transition-colors bg-[rgba(26,40,69,0.55)] border-[#1E3060]"
                  >
                  <span className="text-base">🧪</span>
                  <span className="text-sm font-medium text-slate-200">{subject}</span>
                  <Ico n="chevR" cls="w-3 h-3 text-slate-400 rotate-90" />
                </div>
              </div>
              {/* Studying count */}
              <div className="flex-shrink-0 text-right">
                <div className="text-slate-400 text-sm font-mono">{studyingCount} studying</div>
                <div className="flex -space-x-1.5 mt-2 justify-end">
                  {allParticipants.filter(p => p.isStudying).slice(0, 5).map(p => (
                    <div key={p.id} className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[8px] font-bold text-white border"
                      style={{ background: p.accentColor, borderColor: '#0B1530', zIndex: 1 }}>
                      {p.id === 'user' ? <img src={userAvatar} alt="You" className="w-full h-full object-contain" /> : p.initials}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mx-5 mb-3 flex rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1A2845]"
            >
            {([['studying', '👥', 'Active Studying'], ['chat', '💬', 'Chat']] as const).map(([id, icon, label]) => (
              <button key={id} onClick={() => setActiveTab(id as 'studying' | 'chat')}
                className="flex-1 flex items-center justify-center gap-2.5 py-3 text-sm font-semibold transition-all"
                style={{
                  color: activeTab === id ? '#9B6CFF' : '#4E5E84',
                  background: activeTab === id ? 'rgba(26,40,69,0.55)' : 'transparent',
                  borderBottom: activeTab === id ? '2px solid #7C4DFF' : '2px solid transparent',
                }}>
                <span>{icon}</span>{label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 px-5 pb-5">
            {activeTab === 'studying' && (
              <div className="grid grid-cols-3 gap-3">
                {allParticipants.map((p, i) => (
                  <BotCard key={p.id}
                    bot={{ ...p, studyTimeSecs: i === 0 ? userStudyTime : botTimes[i - 1] ?? p.studyTimeSecs }}
                    canKick={room.isOwner && !p.isMe && p.id !== 'user'}
                    onKick={() => setKickedIds(prev => { const s = new Set(prev); s.add(p.id); return s })}
                    avatarUrl={p.id === 'user' ? userAvatar : undefined}
                  />
                ))}
                {/* Seat available card */}
                <div className="rounded-2xl border overflow-hidden flex flex-col items-center justify-center py-10 cursor-pointer hover:border-violet-500/30 transition-colors"
                  style={{ background: '#0B1530', borderColor: 'rgba(26,40,69,0.55)', borderStyle: 'dashed' }}>
                  <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center mb-3 border-[#1E3060]"
                    >
                    <svg viewBox="0 0 24 24" className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                  <div className="text-slate-300 font-semibold text-sm">Seat Available</div>
                  <div className="text-slate-500 text-xs mt-0.5">Join and start studying</div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="flex flex-col h-full" style={{ minHeight: '400px' }}>
                {chatLocked ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8 py-16">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                      style={{ background: 'rgba(26,40,69,0.55)', border: '1px solid #1A2845' }}>🔒</div>
                    <div className="text-slate-200 font-bold text-base">Chat is locked during focus study</div>
                    <div className="text-slate-400 text-sm leading-relaxed">
                      Finish your focus time to unlock chat.<br />
                      <span className="text-violet-400">Chat opens during breaks only.</span>
                    </div>
                    <button onClick={() => { setFocusRunning(false) }}
                      className="mt-2 px-6 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                      Pause & Open Chat
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 pb-3" style={{ minHeight: '300px' }}>
                      {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ background: msg.isMe ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : '#1A2845' }}>
                            {msg.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className={`flex flex-col gap-0.5 max-w-[70%] ${msg.isMe ? 'items-end' : ''}`}>
                            {!msg.isMe && <span className="text-[10px] text-slate-500 font-mono">{msg.name}</span>}
                            <div className="px-3.5 py-2 rounded-2xl text-sm text-slate-200"
                              style={{ background: msg.isMe ? '#1A2845' : '#0B1530', border: `1px solid ${msg.isMe ? '#1E3060' : 'rgba(26,40,69,0.55)'}` }}>
                              {msg.text}
                            </div>
                            <span className="text-[9px] text-slate-600 font-mono">{msg.time}</span>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-[rgba(26,40,69,0.55)]" >
                      <input
                        className="flex-1 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/40 transition-colors bg-[#0B1530] border-[#1A2845]"
                        
                        placeholder="Type a message..."
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      />
                      <button onClick={sendMessage}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90 flex-shrink-0 bg-[#7C4DFF]"
                        >
                        <Ico n="arrow" cls="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Battleground Page ────────────────────────────────────────────────────────

function BattleAnimeAvatar({ color, size = 56, initials = '??' }: { color: string; size?: number; initials?: string }) {
  const r = size / 2
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="27" stroke={color} strokeWidth="2" fill="#0B1530" />
        <circle cx="28" cy="28" r="26" stroke={color} strokeWidth="0.5" opacity="0.3" />
        {/* Glow */}
        <circle cx="28" cy="28" r="24" fill={`${color}08`} />
        {/* Body silhouette */}
        <ellipse cx="28" cy="36" rx="10" ry="8" fill={`${color}20`} />
        {/* Head */}
        <ellipse cx="28" cy="21" rx="8" ry="9" fill={`${color}35`} />
        {/* Hair */}
        <path d="M20 18 Q22 10 28 11 Q34 10 36 18" fill={color} opacity="0.75" />
        <path d="M20 18 Q19 14 21 16" fill={color} opacity="0.6" />
        <path d="M36 18 Q37 14 35 16" fill={color} opacity="0.6" />
        {/* Headphone band */}
        <path d="M19 22 Q19 13 28 13 Q37 13 37 22" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Headphone cups */}
        <rect x="16.5" y="20.5" width="4.5" height="7" rx="2.25" fill={color} opacity="0.85" />
        <rect x="35" y="20.5" width="4.5" height="7" rx="2.25" fill={color} opacity="0.85" />
        {/* Eyes */}
        <ellipse cx="24.5" cy="22" rx="1.5" ry="1.8" fill={color} opacity="0.9" />
        <ellipse cx="31.5" cy="22" rx="1.5" ry="1.8" fill={color} opacity="0.9" />
        {/* Initials label */}
        <text x="28" y="48" textAnchor="middle" fontSize="7" fill={color} fontFamily="monospace" opacity="0.85" fontWeight="bold">{initials}</text>
      </svg>
    </div>
  )
}

function BattleTrophySVG({ tier }: { tier: 'bronze' | 'silver' | 'gold' | 'diamond' }) {
  const cols = { bronze: '#CD7F32', silver: '#B8C4CC', gold: '#FFD700', diamond: '#B57BEE' }
  const c = cols[tier]
  const hasStar = tier === 'gold' || tier === 'diamond'
  return (
    <svg width="44" height="48" viewBox="0 0 44 48" fill="none">
      {/* Cup body */}
      <path d="M13 4 L31 4 L29 24 Q28 28 22 28 Q16 28 15 24 Z" fill={c} opacity="0.85" />
      {/* Shine */}
      <path d="M16 6 L18 22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
      {/* Handles */}
      <path d="M13 8 Q6 8 6 15 Q6 21 13 20" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M31 8 Q38 8 38 15 Q38 21 31 20" stroke={c} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Stem */}
      <rect x="19.5" y="28" width="5" height="9" rx="1" fill={c} opacity="0.8" />
      {/* Base */}
      <rect x="13" y="37" width="18" height="4" rx="2" fill={c} opacity="0.9" />
      {hasStar && <text x="22" y="20" textAnchor="middle" fontSize="9" fill="white" opacity="0.9">★</text>}
      {tier === 'diamond' && <text x="22" y="20" textAnchor="middle" fontSize="9" fill="white" opacity="0.9">◆</text>}
    </svg>
  )
}


// ─── Schedules Page ────────────────────────────────────────────────────────────

interface ScheduleItem {
  id: string; subject: string; topic: string
  startTime: string; endTime: string; color: string; iconEmoji: string
}

interface FocusRoutine {
  id: string; name: string; days: number[]
  apps: string[]; websites: string[]
  timeFrom: string; timeTo: string; enabled: boolean
}

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDates(): number[] {
  const today = new Date(), dow = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d.getDate()
  })
}

const SUBJECT_COLOR_MAP: Record<string, string> = {
  physics: '#3B82F6', chemistry: '#A855F7', mathematics: '#19B5E6', maths: '#19B5E6',
  biology: '#19D3A2', history: '#F59E0B', geography: '#F87171', english: '#EC4899',
  economics: '#7C4DFF', computer: '#19B5E6',
}
function subjectColor(name: string): string {
  const key = name.toLowerCase()
  for (const k of Object.keys(SUBJECT_COLOR_MAP)) if (key.includes(k)) return SUBJECT_COLOR_MAP[k]
  const palette = SUBJECT_COLORS
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % palette.length
  return palette[h]
}
function subjectEmoji(name: string): string {
  const k = name.toLowerCase()
  if (k.includes('physics')) return '📘'
  if (k.includes('chem')) return '🧪'
  if (k.includes('math') || k.includes('maths')) return '📐'
  if (k.includes('bio')) return '🌿'
  if (k.includes('hist')) return '📜'
  if (k.includes('geo')) return '🌍'
  if (k.includes('eng')) return '✏️'
  if (k.includes('econ')) return '📊'
  if (k.includes('comp') || k.includes('cs')) return '💻'
  return '📚'
}

const APP_LIST = [
  { name: 'Instagram', bg: 'linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)', label: '📸', textDark: false },
  { name: 'YouTube', bg: '#FF0000', label: '▶', textDark: false },
  { name: 'WhatsApp', bg: 'linear-gradient(135deg,#25D366,#128C7E)', label: '💬', textDark: false },
  { name: 'X', bg: '#1A1A1A', label: '𝕏', textDark: false },
  { name: 'Discord', bg: 'linear-gradient(135deg,#5865F2,#4752C4)', label: '⚡', textDark: false },
  { name: 'Snapchat', bg: '#FFFC00', label: '👻', textDark: true },
  { name: 'TikTok', bg: '#000000', label: '♪', textDark: false },
  { name: 'Netflix', bg: '#E50914', label: '🎬', textDark: false },
  { name: 'Reddit', bg: 'linear-gradient(135deg,#FF4500,#CC3600)', label: '●', textDark: false },
  { name: 'Twitch', bg: 'linear-gradient(135deg,#9146FF,#6441A4)', label: '♦', textDark: false },
  { name: 'Telegram', bg: 'linear-gradient(135deg,#2AABEE,#229ED9)', label: '✈', textDark: false },
  { name: 'LinkedIn', bg: '#0077B5', label: 'in', textDark: false },
]

const WEBSITE_SUGGESTIONS = [
  'youtube.com', 'instagram.com', 'twitter.com', 'reddit.com', 'netflix.com',
  'twitch.tv', 'facebook.com', 'tiktok.com', 'pinterest.com', 'amazon.com',
]

const SUBJECT_COLORS = ['#3B82F6', '#A855F7', '#19B5E6', '#19D3A2', '#F59E0B', '#F87171', '#EC4899']

function SchedulesPage({ onNavigate, schedule, setSchedule, sharedUnits, setSharedUnits, profile }: {
  onNavigate: (id: string) => void
  schedule: ScheduleItem[][]
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[][]>>
  sharedUnits: StudyUnit[]
  setSharedUnits: React.Dispatch<React.SetStateAction<StudyUnit[]>>
  profile?: ProfileInfo
}) {
  const weekDates = getWeekDates()
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  const [activeDay, setActiveDay] = useState(todayIdx)
  const [editMode, setEditMode] = useState(false)
  const [showAddSession, setShowAddSession] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [aiStep, setAiStep] = useState<'form' | 'generating' | 'done'>('form')
  const [blockedApps, setBlockedApps] = useState<Set<string>>(new Set(['Instagram', 'YouTube', 'WhatsApp', 'X', 'Discord']))
  const [blockedWebsites, setBlockedWebsites] = useState<string[]>([])
  const [websiteInput, setWebsiteInput] = useState('')
  const [showMoreApps, setShowMoreApps] = useState(false)
  const [routines, setRoutines] = useState<FocusRoutine[]>([])
  const [showCreateRoutine, setShowCreateRoutine] = useState(false)
  const [newSession, setNewSession] = useState({ subject: '', topic: '', startTime: '9:00 AM', endTime: '11:00 AM', color: '#3B82F6' })
  const [newRoutine, setNewRoutine] = useState({ name: '', days: [] as number[], apps: [] as string[], websites: [] as string[], customWebsite: '', timeFrom: '08:00', timeTo: '22:00' })
  const [aiForm, setAiForm] = useState({ subjects: '', exam: '', hoursPerDay: '8' })

  const currentDaySchedule = schedule[activeDay] || []

  function generateAI() {
    setAiStep('generating')
    setTimeout(() => setAiStep('done'), 2800)
  }

  function applyAISchedule() {
    const subjects = aiForm.subjects.split(',').map(s => s.trim()).filter(Boolean)
    const times = [['8:00 AM', '10:00 AM'], ['11:00 AM', '1:00 PM'], ['3:00 PM', '5:00 PM'], ['6:00 PM', '7:30 PM']]
    const generated: ScheduleItem[][] = Array.from({ length: 7 }, (_, dayI) =>
      subjects.map((sub, si) => ({
        id: `ai_${dayI}_${si}_${Date.now()}`, subject: sub,
        topic: sharedUnits.find(u => u.subject.toLowerCase() === sub.toLowerCase())?.topics[0] || 'Study session',
        startTime: times[si % times.length][0], endTime: times[si % times.length][1],
        color: subjectColor(sub), iconEmoji: subjectEmoji(sub),
      }))
    )
    setSchedule(generated)
    subjects.forEach(sub => {
      if (!sharedUnits.find(u => u.subject.toLowerCase() === sub.toLowerCase())) {
        setSharedUnits(prev => [...prev, { subject: sub, exam: aiForm.exam, topics: ['Study session'] }])
      }
    })
    setShowAI(false); setAiStep('form')
  }

  function addSession() {
    const sub = newSession.subject.trim()
    if (!sub) return
    const item: ScheduleItem = {
      id: String(Date.now()), subject: sub, topic: newSession.topic,
      startTime: newSession.startTime, endTime: newSession.endTime,
      color: newSession.color, iconEmoji: subjectEmoji(sub),
    }
    setSchedule(prev => { const n = [...prev]; n[activeDay] = [...n[activeDay], item]; return n })
    if (!sharedUnits.find(u => u.subject.toLowerCase() === sub.toLowerCase())) {
      setSharedUnits(prev => [...prev, { subject: sub, exam: '', topics: newSession.topic ? [newSession.topic] : ['Study session'] }])
    }
    setShowAddSession(false)
    setNewSession({ subject: '', topic: '', startTime: '9:00 AM', endTime: '11:00 AM', color: '#3B82F6' })
  }

  function deleteSession(id: string) {
    const session = (schedule[activeDay] || []).find(s => s.id === id)
    setSchedule(prev => { const n = [...prev]; n[activeDay] = n[activeDay].filter(s => s.id !== id); return n })
    if (session) {
      const stillExists = schedule.some((day, di) =>
        di !== activeDay && day.some(s => s.subject.toLowerCase() === session.subject.toLowerCase())
      ) || (schedule[activeDay] || []).filter(s => s.id !== id).some(s => s.subject.toLowerCase() === session.subject.toLowerCase())
      if (!stillExists) {
        setSharedUnits(prev => prev.filter(u => u.subject.toLowerCase() !== session.subject.toLowerCase()))
      }
    }
  }

  function toggleApp(name: string) {
    setBlockedApps(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s })
  }

  function addBlockedWebsite() {
    const w = websiteInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (w && !blockedWebsites.includes(w)) { setBlockedWebsites(prev => [...prev, w]); setWebsiteInput('') }
  }

  function toggleRoutineDay(i: number) {
    setNewRoutine(prev => ({ ...prev, days: prev.days.includes(i) ? prev.days.filter(d => d !== i) : [...prev.days, i] }))
  }

  function toggleRoutineApp(name: string) {
    setNewRoutine(prev => ({ ...prev, apps: prev.apps.includes(name) ? prev.apps.filter(a => a !== name) : [...prev.apps, name] }))
  }

  function toggleRoutineWebsite(w: string) {
    setNewRoutine(prev => ({ ...prev, websites: prev.websites.includes(w) ? prev.websites.filter(x => x !== w) : [...prev.websites, w] }))
  }

  function addCustomWebsite() {
    const w = newRoutine.customWebsite.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (w && !newRoutine.websites.includes(w)) setNewRoutine(prev => ({ ...prev, websites: [...prev.websites, w], customWebsite: '' }))
  }

  function createRoutine() {
    if (!newRoutine.name) return
    setRoutines(prev => [...prev, {
      id: String(Date.now()), name: newRoutine.name, days: newRoutine.days,
      apps: newRoutine.apps, websites: newRoutine.websites,
      timeFrom: newRoutine.timeFrom, timeTo: newRoutine.timeTo, enabled: true,
    }])
    setShowCreateRoutine(false)
    setNewRoutine({ name: '', days: [], apps: [], websites: [], customWebsite: '', timeFrom: '08:00', timeTo: '22:00' })
  }

  function fmtTime(t: string) {
    if (t.includes(':') && !t.includes(' ')) {
      const [h, m] = t.split(':').map(Number)
      return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
    }
    return t
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]" >
      <Sidebar active="schedules" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" >SCHEDULES & BLOCKERS</div>
            <div className="text-sm font-semibold text-slate-200">Build your perfect study routine.</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Page title */}
          <div>
            <h1 className="text-2xl font-bold text-white">Schedule & Blockers</h1>
            <p className="text-slate-400 text-sm mt-0.5">Build your perfect study routine and stay distraction-free.</p>
          </div>

          {/* ── AI Assistant Banner ── */}
          <div className="rounded-2xl border p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0F1535,#141B40)', borderColor: '#2855CC', boxShadow: '0 0 40px rgba(124,77,255,0.25), 0 0 80px rgba(40,85,204,0.1)' }}>
            <div className="absolute right-0 top-0 bottom-0 w-40 opacity-15 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at right,#7C4DFF,transparent)' }} />
            <div className="flex items-center gap-5 relative">
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden">
                <img src={aiAssistantImg} alt="AI Assistant" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-violet-400 font-mono tracking-[0.15em] mb-0.5">AI ASSISTANT</div>
                <div className="text-lg font-bold text-white mb-0.5">Create Your Study Schedule</div>
                <div className="text-sm text-slate-400 leading-relaxed">Tell us your subjects, goals and available time. Our AI will build a personalized plan for you.</div>
              </div>
              <button onClick={() => { setShowAI(true); setAiStep('form') }}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-white text-sm transition-all hover:opacity-90 active:scale-95"
                style={{ background: '#7C4DFF', boxShadow: '0 0 24px rgba(40,85,204,0.55), 0 0 48px rgba(124,77,255,0.2)' }}>
                ✦ Generate with AI
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* ── Your Schedule ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(26,40,69,0.55)', border: '1px solid #1E3060' }}>
                  <Ico n="clock" cls="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">Your Schedule</div>
                  <div className="text-[11px] text-slate-500">Stay consistent. Track your progress.</div>
                </div>
              </div>
              <button onClick={() => setEditMode(e => !e)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm transition-all"
                style={{ borderColor: editMode ? '#4A3A88' : '#1A2845', color: editMode ? '#9B6CFF' : '#4E5E84', background: editMode ? 'rgba(26,40,69,0.55)' : 'transparent' }}>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                {editMode ? 'Done' : 'Edit'}
              </button>
            </div>

            {/* Day tabs */}
            <div className="flex gap-1.5 px-5 mb-4">
              {DAYS_SHORT.map((day, i) => (
                <button key={i} onClick={() => setActiveDay(i)}
                  className="flex-1 flex flex-col items-center py-2.5 rounded-xl transition-all"
                  style={{
                    background: activeDay === i ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : '#0B1530',
                    border: `1px solid ${activeDay === i ? '#563FA0' : 'rgba(26,40,69,0.55)'}`,
                    boxShadow: activeDay === i ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
                  }}>
                  <span className="text-[10px] font-semibold" style={{ color: activeDay === i ? 'rgba(255,255,255,0.75)' : '#4E5E84' }}>{day}</span>
                  <span className="text-base font-bold leading-tight" style={{ color: activeDay === i ? '#fff' : '#4E5E84' }}>{weekDates[i]}</span>
                </button>
              ))}
            </div>

            {/* Session rows */}
            <div className="px-4 pb-2 space-y-2">
              {currentDaySchedule.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-sm">No sessions for {DAYS_SHORT[activeDay]}. Add one below!</div>
              )}
              {currentDaySchedule.map(session => (
                <div key={session.id}
                  className="flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:border-violet-500/30 group bg-[#0B1530] border-[rgba(26,40,69,0.55)]"
                  >
                  {editMode && (
                    <button onClick={() => deleteSession(session.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors bg-[rgba(248,113,113,0.15)] text-[#F87171]"
                      >
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${session.color}18`, border: `1px solid ${session.color}40` }}>
                    {session.iconEmoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-100">{session.subject}</div>
                    <div className="text-[11px] text-slate-500">{session.topic}</div>
                  </div>
                  <div className="text-[11px] text-slate-400 mr-3 flex-shrink-0" >
                    {session.startTime} – {session.endTime}
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white flex-shrink-0 transition-all hover:opacity-90"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 12px rgba(124,77,255,0.45)' }}>
                    🎯 Focus Mode
                  </button>
                  <Ico n="chevR" cls="w-4 h-4 text-slate-600" />
                </div>
              ))}
            </div>

            {/* Add new */}
            <button onClick={() => setShowAddSession(true)}
              className="w-full flex items-center gap-3 px-5 py-4 border-t transition-all hover:bg-white/[0.02] group border-[rgba(26,40,69,0.55)]"
              >
              <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: '#2855CC', borderStyle: 'dashed' }}>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <span className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">Add New Schedule</span>
              <Ico n="chevR" cls="w-4 h-4 text-slate-600 ml-auto" />
            </button>
          </div>

          {/* ── Block Distracting Apps & Websites ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,rgba(239,68,68,0.18),rgba(220,38,38,0.1))', border: '1px solid rgba(239,68,68,0.3)' }}>
                  🚫
                </div>
                <div>
                  <div className="text-base font-bold text-white">Block Distracting Apps & Websites</div>
                  <div className="text-[11px] text-slate-500">Select what to block during your study time.</div>
                </div>
              </div>
              <button onClick={() => setShowMoreApps(true)}
                className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                All apps <Ico n="arrow" cls="w-3 h-3" />
              </button>
            </div>

            {/* App grid */}
            <div className="px-5 mb-1">
              <div className="text-[10px] text-slate-500 font-mono mb-2">APPS</div>
              <div className="grid grid-cols-6 gap-3 mb-4">
                {APP_LIST.slice(0, 5).map(app => {
                  const blocked = blockedApps.has(app.name)
                  return (
                    <button key={app.name} onClick={() => toggleApp(app.name)}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border relative transition-all hover:scale-[1.04]"
                      style={{ background: blocked ? 'rgba(124,77,255,0.08)' : '#0B1530', borderColor: blocked ? '#2855CC' : 'rgba(26,40,69,0.55)' }}>
                      {blocked && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center bg-[#7C4DFF]" >
                          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 6l2 2 4-4" /></svg>
                        </div>
                      )}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: app.bg, color: app.textDark ? '#000' : '#fff' }}>
                        {app.label}
                      </div>
                      <span className="text-[10px] text-slate-400 text-center leading-tight">{app.name}</span>
                    </button>
                  )
                })}
                <button onClick={() => setShowMoreApps(true)}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all hover:scale-[1.04]"
                  style={{ background: '#0B1530', borderColor: 'rgba(26,40,69,0.55)', borderStyle: 'dashed' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(26,40,69,0.55)', border: '1px solid #1A2845' }}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                  <span className="text-[10px] text-slate-400">More</span>
                </button>
              </div>
            </div>

            {/* Website blocker */}
            <div className="px-5 pb-5 border-t pt-4 border-[rgba(26,40,69,0.55)]" >
              <div className="text-[10px] text-slate-500 font-mono mb-3">WEBSITES</div>
              <div className="flex gap-2 mb-3">
                <input value={websiteInput} onChange={e => setWebsiteInput(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                   placeholder="e.g. youtube.com, reddit.com..."
                  onKeyDown={e => e.key === 'Enter' && addBlockedWebsite()} />
                <button onClick={addBlockedWebsite}
                  className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 bg-[#7C4DFF]"
                  >Block</button>
              </div>
              {blockedWebsites.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-2">No websites blocked yet. Add URLs above.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {blockedWebsites.map(w => (
                    <div key={w} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.3)] text-[#FCA5A5]"
                      >
                      🌐 {w}
                      <button onClick={() => setBlockedWebsites(prev => prev.filter(x => x !== w))}
                        className="text-slate-500 hover:text-red-400 transition-colors ml-0.5">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Create Focus Routine ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(26,40,69,0.55)', border: '1px solid #1E3060' }}>⏰</div>
                <div>
                  <div className="text-base font-bold text-white">Create Focus Routine</div>
                  <div className="text-[11px] text-slate-500">Set blocking rules once, activate like an alarm when needed.</div>
                </div>
              </div>
              <button onClick={() => setShowCreateRoutine(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: '#7C4DFF', boxShadow: '0 0 16px rgba(124,77,255,0.5)' }}>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                New Routine
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {routines.length === 0 && (
                <div className="py-8 text-center text-slate-500 text-sm">No routines yet. Create one to get started.</div>
              )}
              {routines.map(routine => (
                <div key={routine.id} className="p-4 rounded-2xl border transition-all"
                  style={{ background: '#0B1530', borderColor: routine.enabled ? '#2855CC' : 'rgba(26,40,69,0.55)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-white">{routine.name}</span>
                      {routine.enabled && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.25)' }}>ACTIVE</span>
                      )}
                    </div>
                    <button
                      onClick={() => setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: !r.enabled } : r))}
                      className="w-11 h-6 rounded-full transition-all flex-shrink-0 relative"
                      style={{ background: routine.enabled ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'rgba(100,116,139,0.3)', boxShadow: routine.enabled ? '0 0 12px rgba(40,85,204,0.45)' : 'none' }}>
                      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-md"
                        style={{ left: routine.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>

                  {/* Days */}
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {DAYS_SHORT.map((day, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: routine.days.includes(i) ? '#1A2845' : '#0B1530',
                          color: routine.days.includes(i) ? '#C4AAFF' : '#4E5E84',
                          border: `1px solid ${routine.days.includes(i) ? '#2855CC' : 'rgba(26,40,69,0.55)'}`,
                        }}>{day}</span>
                    ))}
                  </div>

                  {/* Info row */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Ico n="clock" cls="w-3 h-3 text-violet-400" />
                      <span >{fmtTime(routine.timeFrom)} → {fmtTime(routine.timeTo)}</span>
                    </div>
                    {routine.apps.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>🚫</span>
                        <span>{routine.apps.slice(0, 3).join(', ')}{routine.apps.length > 3 ? ` +${routine.apps.length - 3}` : ''}</span>
                      </div>
                    )}
                    {routine.websites.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span>🌐</span>
                        <span>{routine.websites.length} site{routine.websites.length > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[rgba(26,40,69,0.55)]" >
                    <button onClick={() => setRoutines(prev => prev.filter(r => r.id !== routine.id))}
                      className="text-[11px] text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10">
                      Delete routine
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-6" />
        </main>
      </div>

      {/* ── AI Modal ── */}
      {showAI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)]" 
          onClick={e => { if (e.target === e.currentTarget && aiStep !== 'generating') setShowAI(false) }}>
          <div className="rounded-2xl border w-[460px] overflow-hidden"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 80px #1A2845' }}>
            {aiStep === 'form' && (
              <div className="p-7">
                <div className="text-center mb-6">
                  <div className="text-4xl mb-2">🤖</div>
                  <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">AI ASSISTANT</div>
                  <div className="text-xl font-bold text-white">Generate Your Schedule</div>
                  <div className="text-sm text-slate-400 mt-1">Tell us about your study goals</div>
                </div>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-1 block">SUBJECTS</label>
                    <input value={aiForm.subjects} onChange={e => setAiForm(f => ({ ...f, subjects: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       placeholder="Physics, Chemistry, Mathematics..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-1 block">TARGET EXAM / GOAL</label>
                    <input value={aiForm.exam} onChange={e => setAiForm(f => ({ ...f, exam: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       placeholder="JEE Advanced, NEET, Board Exams..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-2 block">AVAILABLE HOURS PER DAY</label>
                    <div className="flex gap-2">
                      {['4', '6', '8', '10', '12'].map(h => (
                        <button key={h} onClick={() => setAiForm(f => ({ ...f, hoursPerDay: h }))}
                          className="flex-1 py-2 rounded-xl border text-sm font-semibold transition-all"
                          style={{ background: aiForm.hoursPerDay === h ? '#1A2845' : 'transparent', color: aiForm.hoursPerDay === h ? '#C4AAFF' : '#4E5E84', borderColor: aiForm.hoursPerDay === h ? '#4A3A88' : '#1A2845' }}>
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAI(false)}
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]" >Cancel</button>
                  <button onClick={generateAI}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 24px rgba(124,77,255,0.55), 0 0 48px rgba(25,181,230,0.2)' }}>
                    ✦ Generate Schedule
                  </button>
                </div>
              </div>
            )}
            {aiStep === 'generating' && (
              <div className="p-12 text-center">
                <div className="text-5xl mb-4 animate-bounce">🤖</div>
                <div className="text-lg font-bold text-white mb-2">Generating your schedule...</div>
                <div className="text-sm text-slate-400 mb-6">Analyzing subjects and optimizing study time.</div>
                <div className="flex justify-center gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2.5 h-2.5 rounded-full bg-violet-500"
                      style={{ animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            {aiStep === 'done' && (
              <div className="p-7">
                <div className="text-center mb-5">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="text-lg font-bold text-white">Schedule Ready!</div>
                  <div className="text-sm text-slate-400 mt-1">Your personalized 7-day plan is generated.</div>
                </div>
                <div className="rounded-xl border p-4 mb-5 space-y-2.5 bg-[#0B1530] border-[#1A2845]" >
                  {aiForm.subjects.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4).map((sub, i) => {
                    const times = [['8:00 AM', '10:00 AM'], ['11:00 AM', '1:00 PM'], ['3:00 PM', '5:00 PM'], ['6:00 PM', '7:30 PM']]
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${subjectColor(sub)}20` }}>{subjectEmoji(sub)}</div>
                        <span className="text-slate-200 font-medium flex-1">{sub}</span>
                        <span className="text-slate-500 font-mono text-[11px]">{times[i][0]} – {times[i][1]}</span>
                      </div>
                    )
                  })}
                  <div className="text-[10px] text-violet-400 text-center pt-1 font-mono">Scheduled across all 7 days</div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setAiStep('form') }}
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]" >Regenerate</button>
                  <button onClick={applyAISchedule}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>Apply Schedule</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Session Modal ── */}
      {showAddSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]" 
          onClick={e => { if (e.target === e.currentTarget) setShowAddSession(false) }}>
          <div className="rounded-2xl border p-7 w-[420px]"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 50px rgba(124,77,255,0.3), 0 0 100px rgba(40,85,204,0.12)' }}>
            <div className="text-center mb-5">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">NEW SESSION</div>
              <div className="text-lg font-bold text-white">Add Study Session</div>
              <div className="text-sm text-slate-400 mt-0.5">{DAYS_SHORT[activeDay]}, {weekDates[activeDay]}</div>
            </div>
            <div className="space-y-3 mb-5">
              <input value={newSession.subject} onChange={e => setNewSession(s => ({ ...s, subject: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                 placeholder="Subject (e.g. Physics)" />
              <input value={newSession.topic} onChange={e => setNewSession(s => ({ ...s, topic: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                 placeholder="Topic (e.g. Chapter 5 – Current Electricity)" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 mb-1 block font-mono">FROM</label>
                  <input value={newSession.startTime} onChange={e => setNewSession(s => ({ ...s, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600 border-[#1A2845]"
                     placeholder="9:00 AM" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 mb-1 block font-mono">TO</label>
                  <input value={newSession.endTime} onChange={e => setNewSession(s => ({ ...s, endTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600 border-[#1A2845]"
                     placeholder="11:00 AM" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-2 block font-mono">COLOR</label>
                <div className="flex gap-2">
                  {SUBJECT_COLORS.map(c => (
                    <button key={c} onClick={() => setNewSession(s => ({ ...s, color: c }))}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110 border-2"
                      style={{ background: c, borderColor: newSession.color === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddSession(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]" >Cancel</button>
              <button onClick={addSession}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>Add Session</button>
            </div>
          </div>
        </div>
      )}

      {/* ── All Apps Modal ── */}
      {showMoreApps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]" 
          onClick={e => { if (e.target === e.currentTarget) setShowMoreApps(false) }}>
          <div className="rounded-2xl border p-7 w-[480px]"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 50px rgba(124,77,255,0.3), 0 0 100px rgba(40,85,204,0.12)' }}>
            <div className="text-center mb-5">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">APP BLOCKER</div>
              <div className="text-lg font-bold text-white">Manage Blocked Apps</div>
              <div className="text-sm text-slate-400 mt-0.5">{blockedApps.size} app{blockedApps.size !== 1 ? 's' : ''} currently blocked</div>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-5 max-h-72 overflow-y-auto">
              {APP_LIST.map(app => {
                const blocked = blockedApps.has(app.name)
                return (
                  <button key={app.name} onClick={() => toggleApp(app.name)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border relative transition-all hover:scale-105"
                    style={{ background: blocked ? 'rgba(26,40,69,0.55)' : '#0B1530', borderColor: blocked ? '#4A3A88' : 'rgba(26,40,69,0.55)' }}>
                    {blocked && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center bg-[#7C4DFF]" >
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 6l2 2 4-4" /></svg>
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: app.bg, color: app.textDark ? '#000' : '#fff' }}>{app.label}</div>
                    <span className="text-[9px] text-slate-400 text-center">{app.name}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowMoreApps(false)}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 bg-[#7C4DFF]"
              >Done</button>
          </div>
        </div>
      )}

      {/* ── Create Focus Routine Modal ── */}
      {showCreateRoutine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.78)]" 
          onClick={e => { if (e.target === e.currentTarget) setShowCreateRoutine(false) }}>
          <div className="rounded-2xl border w-[500px] overflow-hidden" style={{ maxHeight: '90vh', background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
            <div className="overflow-y-auto" style={{ maxHeight: '90vh' }}>
              <div className="p-7">
                <div className="text-center mb-6">
                  <div className="text-3xl mb-2">⏰</div>
                  <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">FOCUS ROUTINE</div>
                  <div className="text-lg font-bold text-white">Create Blocking Routine</div>
                  <div className="text-sm text-slate-400 mt-0.5">Set it once, activate when needed — like an alarm.</div>
                </div>

                <div className="space-y-5">
                  {/* Name */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-1.5 block">ROUTINE NAME</label>
                    <input value={newRoutine.name} onChange={e => setNewRoutine(r => ({ ...r, name: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       placeholder="e.g. Study Week, Morning Focus, Exam Mode..." />
                  </div>

                  {/* Days */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-2 block">ACTIVE DAYS</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_SHORT.map((day, i) => {
                        const sel = newRoutine.days.includes(i)
                        return (
                          <button key={i} onClick={() => toggleRoutineDay(i)}
                            className="px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all"
                            style={{ background: sel ? '#1A2845' : '#0B1530', color: sel ? '#C4AAFF' : '#4E5E84', borderColor: sel ? '#4A3A88' : 'rgba(26,40,69,0.55)' }}>
                            {day}
                          </button>
                        )
                      })}
                      <button onClick={() => setNewRoutine(r => ({ ...r, days: r.days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6] }))}
                        className="px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all"
                        style={{ borderColor: '#1A2845', color: '#4E5E84', background: 'transparent' }}>
                        {newRoutine.days.length === 7 ? 'Clear' : 'All'}
                      </button>
                    </div>
                  </div>

                  {/* Time range */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-1.5 block">BLOCK TIME RANGE</label>
                    <div className="flex gap-3 items-center">
                      <input type="time" value={newRoutine.timeFrom} onChange={e => setNewRoutine(r => ({ ...r, timeFrom: e.target.value }))}
                        className="flex-1 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors"
                        style={{ borderColor: '#1A2845', colorScheme: 'dark' }} />
                      <span className="text-slate-500">→</span>
                      <input type="time" value={newRoutine.timeTo} onChange={e => setNewRoutine(r => ({ ...r, timeTo: e.target.value }))}
                        className="flex-1 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors"
                        style={{ borderColor: '#1A2845', colorScheme: 'dark' }} />
                    </div>
                  </div>

                  {/* Block Apps */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-2 block">BLOCK APPS</label>
                    <div className="grid grid-cols-4 gap-2">
                      {APP_LIST.map(app => {
                        const sel = newRoutine.apps.includes(app.name)
                        return (
                          <button key={app.name} onClick={() => toggleRoutineApp(app.name)}
                            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border relative transition-all hover:scale-105"
                            style={{ background: sel ? 'rgba(26,40,69,0.55)' : '#0B1530', borderColor: sel ? '#2855CC' : 'rgba(26,40,69,0.55)' }}>
                            {sel && (
                              <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center bg-[#7C4DFF]" >
                                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 6l2 2 4-4" /></svg>
                              </div>
                            )}
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: app.bg, color: app.textDark ? '#000' : '#fff' }}>{app.label}</div>
                            <span className="text-[9px] text-slate-400 text-center leading-tight">{app.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Block Websites */}
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-2 block">BLOCK WEBSITES</label>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {WEBSITE_SUGGESTIONS.map(w => {
                        const sel = newRoutine.websites.includes(w)
                        return (
                          <button key={w} onClick={() => toggleRoutineWebsite(w)}
                            className="px-2.5 py-1 rounded-full text-[11px] transition-all border"
                            style={{ background: sel ? 'rgba(26,40,69,0.55)' : '#0B1530', color: sel ? '#C4AAFF' : '#4E5E84', borderColor: sel ? '#2855CC' : 'rgba(26,40,69,0.55)' }}>
                            {sel ? '✓ ' : ''}{w}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-2">
                      <input value={newRoutine.customWebsite} onChange={e => setNewRoutine(r => ({ ...r, customWebsite: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/40 transition-colors border-[#1A2845]"
                         placeholder="Add custom URL (e.g. example.com)"
                        onKeyDown={e => e.key === 'Enter' && addCustomWebsite()} />
                      <button onClick={addCustomWebsite}
                        className="px-4 py-2 rounded-xl text-violet-400 border transition-colors hover:border-violet-400/40 border-[#1A2845] bg-[rgba(124,77,255,0.08)]"
                        >Add</button>
                    </div>
                    {newRoutine.websites.filter(w => !WEBSITE_SUGGESTIONS.includes(w)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {newRoutine.websites.filter(w => !WEBSITE_SUGGESTIONS.includes(w)).map(w => (
                          <span key={w} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border text-[#7DD8F0] bg-[rgba(25,181,230,0.06)] border-[rgba(25,181,230,0.20)]"
                            >
                            🌐 {w}
                            <button onClick={() => setNewRoutine(r => ({ ...r, websites: r.websites.filter(x => x !== w) }))}
                              className="text-slate-500 hover:text-red-400 transition-colors">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowCreateRoutine(false)}
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]" >Cancel</button>
                  <button onClick={createRoutine}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>Create Routine</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Battleground Page ─────────────────────────────────────────────────────────

function AnimeAvatarSVG({ color, variant = 0, size = 56 }: { color: string; variant?: number; size?: number }) {
  const hairStyles = [
    <><ellipse key="h1" cx="28" cy="15" rx="13" ry="10" fill={color} opacity="0.95" /><rect key="h2" x="15" y="15" width="26" height="6" fill={color} opacity="0.95" /><rect key="h3" x="15" y="21" width="3" height="12" rx="1.5" fill={color} opacity="0.8" /><rect key="h4" x="38" y="21" width="3" height="12" rx="1.5" fill={color} opacity="0.8" /></>,
    <><ellipse key="h1" cx="28" cy="13" rx="13" ry="9" fill={color} opacity="0.95" /><path key="h2" d="M15 18 Q17 10 28 10 Q39 10 41 18 L41 16 Q36 6 28 7 Q20 6 15 16 Z" fill={color} opacity="0.7" /><path key="h3" d="M22 10 L20 5 M28 8 L27 3 M34 10 L36 5" stroke={color} strokeWidth="2.5" strokeLinecap="round" /></>,
    <><ellipse key="h1" cx="28" cy="14" rx="13" ry="10" fill={color} opacity="0.95" /><path key="h2" d="M15 20 Q14 30 16 35" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" /><path key="h3" d="M41 20 Q42 30 40 35" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" /></>,
    <><ellipse key="h1" cx="28" cy="14" rx="14" ry="11" fill={color} opacity="0.95" /><path key="h2" d="M14 20 Q13 32 15 38 Q17 42 19 40" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.9" /></>,
  ]
  const hair = hairStyles[variant % hairStyles.length]
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} style={{ borderRadius: '50%', display: 'block' }}>
      <circle cx="28" cy="28" r="28" fill={`${color}18`} />
      {hair}
      <ellipse cx="28" cy="29" rx="10" ry="12" fill="#F2C9A0" />
      <ellipse cx="23.5" cy="27" rx="2.2" ry="2.8" fill="#1a0820" />
      <ellipse cx="32.5" cy="27" rx="2.2" ry="2.8" fill="#1a0820" />
      <circle cx="24.3" cy="26.1" r="0.7" fill="white" opacity="0.9" />
      <circle cx="33.3" cy="26.1" r="0.7" fill="white" opacity="0.9" />
      <path d="M21 23 Q23.5 21.5 26 23" stroke="#4a2060" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M30 23 Q32.5 21.5 35 23" stroke="#4a2060" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M24.5 33 Q28 35 31.5 33" stroke="#c07050" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M12 56 Q13 44 28 42 Q43 44 44 56 Z" fill={color} opacity="0.8" />
      <path d="M17 26 Q17 14 28 14 Q39 14 39 26" stroke={color} strokeWidth="2.5" fill="none" opacity="0.7" strokeLinecap="round" />
      <rect x="13.5" y="24" width="6" height="5" rx="2.5" fill={color} opacity="0.9" />
      <rect x="36.5" y="24" width="6" height="5" rx="2.5" fill={color} opacity="0.9" />
    </svg>
  )
}

function BattleAvatar({ color, variant = 0, size = 56, ringColor, glow = false }: {
  color: string; variant?: number; size?: number; ringColor?: string; glow?: boolean
}) {
  const rc = ringColor || color
  return (
    <div style={{ width: size, height: size, flexShrink: 0, position: 'relative' }}>
      {glow && (
        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: `radial-gradient(circle,${rc}55 0%,transparent 70%)`, filter: 'blur(8px)', zIndex: 0 }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: size, height: size, borderRadius: '50%', border: `2.5px solid ${rc}`, boxShadow: glow ? `0 0 16px ${rc}80,0 0 32px ${rc}30` : 'none', overflow: 'hidden' }}>
        <AnimeAvatarSVG color={color} variant={variant} size={size} />
      </div>
    </div>
  )
}

const TROPHY_TIERS = [
  { label: 'First Battle', sub: '1 battle', tier: 'Bronze', img: trophyBronze, color: '#CD7F32', bg: 'rgba(205,127,50,0.12)', border: 'rgba(205,127,50,0.35)' },
  { label: '10 Battles', sub: '10 battles', tier: 'Silver', img: trophySilver, color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)' },
  { label: '30 Battles', sub: '30 battles', tier: 'Gold', img: trophyGold, color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.4)' },
  { label: '60 Battles', sub: '60 battles', tier: 'Diamond', img: trophyDiamond, color: '#B9F2FF', bg: 'rgba(185,242,255,0.08)', border: 'rgba(185,242,255,0.3)' },
]

interface BAFriend { id: string; name: string; color: string; variant: number; xp: number; status: 'online' | 'busy' | 'offline' }

const BA_TIERS = [
  { n: 'Rookie', min: 0 },
  { n: 'Challenger', min: 500 },
  { n: 'Focused', min: 1200 },
  { n: 'Warrior', min: 2000 },
  { n: 'Elite', min: 3200 },
  { n: 'Unstoppable', min: 5000 },
]
const BA_XP_WIN = 120
const BA_XP_LOSS = 25
const BA_MILESTONES = [1, 10, 30, 60]

const BA_FRIENDS: BAFriend[] = [
  { id: 'aryan', name: 'Aryan', color: '#F59E0B', variant: 1, xp: 3460, status: 'online' },
  { id: 'meera', name: 'Meera', color: '#A855F7', variant: 2, xp: 2420, status: 'online' },
  { id: 'kabir', name: 'Kabir', color: '#19B5E6', variant: 1, xp: 1780, status: 'online' },
  { id: 'dev', name: 'Dev', color: '#19B5E6', variant: 3, xp: 1240, status: 'busy' },
  { id: 'riya', name: 'Riya', color: '#EC4899', variant: 0, xp: 860, status: 'offline' },
  { id: 'nain', name: 'Nain', color: '#3B82F6', variant: 3, xp: 310, status: 'offline' },
]

function baFmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function baFmtXP(n: number) { return Math.round(n).toLocaleString('en-US') }
function baTierInfo(xp: number) {
  let i = 0
  BA_TIERS.forEach((t, k) => { if (xp >= t.min) i = k })
  const cur = BA_TIERS[i], next = BA_TIERS[i + 1] || null
  const frac = next ? (xp - cur.min) / (next.min - cur.min) : 1
  return { i, cur, next, pct: Math.min(100, frac * 100), need: next ? next.min - xp : 0 }
}

function BAStatGrid({ battles, wins, losses, streak, best, focusSecs, xp }: {
  battles: number; wins: number; losses: number; streak: number; best: number; focusSecs: number; xp: number
}) {
  const wr = battles > 0 ? Math.round((wins / battles) * 100) : 0
  const focusStr = `${Math.floor(focusSecs / 3600)}h ${String(Math.floor((focusSecs % 3600) / 60)).padStart(2, '0')}m`
  const items: { l: string; v: string | number; sub?: string; c?: string }[] = [
    { l: 'Total battles', v: battles },
    { l: 'Wins', v: wins, sub: `${wr}% win rate`, c: '#4ade80' },
    { l: 'Losses', v: losses, c: '#f87171' },
    { l: 'Win streak', v: streak, sub: `Best: ${best}`, c: '#22d3ee' },
    { l: 'Focus time', v: focusStr, sub: 'In battles' },
    { l: 'Battle XP', v: baFmtXP(xp), c: '#C4AAFF' },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map(it => (
        <div key={it.l} className="rounded-xl border p-3 bg-[rgba(255,255,255,0.02)] border-[#1A2845]">
          <div className="text-[11px] text-slate-500 mb-1">{it.l}</div>
          <div className="text-lg font-bold" style={{ color: it.c || '#fff' }}>{it.v}</div>
          {it.sub && <div className="text-[10px] text-slate-600 mt-0.5">{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function BattlegroundPage({ onNavigate, profile }: { onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  type BAView = 'home' | 'waiting' | 'profile'
  type ArenaPhase = 'countdown' | 'live' | 'result' | null

  const [view, setView] = useState<BAView>('home')
  const [arenaPhase, setArenaPhase] = useState<ArenaPhase>(null)

  const [meXp, setMeXp] = useState(2610)
  const [meBattles, setMeBattles] = useState(47)
  const [meWins, setMeWins] = useState(31)
  const [meLosses, setMeLosses] = useState(16)
  const [meStreak, setMeStreak] = useState(4)
  const [meBest, setMeBest] = useState(9)
  const [meFocusSecs, setMeFocusSecs] = useState(38 * 3600 + 42 * 60)

  const [invites, setInvites] = useState<{ id: string; ago: string }[]>([
    { id: 'aryan', ago: '2 min ago' },
    { id: 'kabir', ago: '14 min ago' },
  ])

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerSel, setPickerSel] = useState<string | null>(null)

  const [pendingOpp, setPendingOpp] = useState<BAFriend | null>(null)
  const [expirySecs, setExpirySecs] = useState(300)
  const [countdownN, setCountdownN] = useState(3)
  const [battleOpp, setBattleOpp] = useState<BAFriend | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false)
  const [result, setResult] = useState<{ kind: 'won' | 'lost'; opp: BAFriend; elapsed: number; before: number; after: number; gain: number } | null>(null)

  const waitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const expiryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearAllTimers() {
    if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    if (liveIntervalRef.current) clearInterval(liveIntervalRef.current)
    if (expiryIntervalRef.current) clearInterval(expiryIntervalRef.current)
    waitTimeoutRef.current = null; countdownIntervalRef.current = null; liveIntervalRef.current = null; expiryIntervalRef.current = null
  }
  useEffect(() => () => clearAllTimers(), [])

  useEffect(() => {
    if (arenaPhase === 'live') {
      liveIntervalRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000)
    } else if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current); liveIntervalRef.current = null
    }
    return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current) }
  }, [arenaPhase])

  function byId(id: string) { return (BA_FRIENDS.find(f => f.id === id) || BA_FRIENDS[0]) as BAFriend }

  function openPicker() { setPickerOpen(true); setPickerQuery(''); setPickerSel(null) }
  function closePicker() { setPickerOpen(false) }

  function sendChallenge() {
    if (!pickerSel) return
    const f = byId(pickerSel)
    setPickerOpen(false)
    setPendingOpp(f)
    setExpirySecs(300)
    setView('waiting')
    waitTimeoutRef.current = setTimeout(() => startCountdown(f), 5500)
    expiryIntervalRef.current = setInterval(() => {
      setExpirySecs(s => {
        if (s <= 1) { clearAllTimers(); setPendingOpp(null); setView('home'); return 300 }
        return s - 1
      })
    }, 1000)
  }

  function cancelChallenge() {
    clearAllTimers(); setPendingOpp(null); setView('home')
  }

  function acceptInvite(id: string) {
    if (battleOpp) return
    const f = byId(id)
    setInvites(prev => prev.filter(i => i.id !== id))
    startCountdown(f)
  }
  function rejectInvite(id: string) {
    setInvites(prev => prev.filter(i => i.id !== id))
  }

  function startCountdown(opp: BAFriend) {
    clearAllTimers()
    setPendingOpp(opp); setCountdownN(3); setArenaPhase('countdown')
    countdownIntervalRef.current = setInterval(() => {
      setCountdownN(n => {
        if (n <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
          setBattleOpp(opp); setElapsedSecs(0); setPendingOpp(null)
          setArenaPhase('live')
          return 3
        }
        return n - 1
      })
    }, 1000)
  }

  function requestPause() { setPauseConfirmOpen(true) }
  function keepFocusing() { setPauseConfirmOpen(false) }
  function confirmPause() { finishBattle('lost', true) }
  function opponentPausesFirst() { finishBattle('won', true) }

  function finishBattle(kind: 'won' | 'lost', apply: boolean) {
    const opp = battleOpp || byId('aryan')
    const gain = kind === 'won' ? BA_XP_WIN : BA_XP_LOSS
    const before = meXp
    setResult({ kind, opp, elapsed: elapsedSecs, before, after: before + gain, gain })
    if (apply) {
      setMeBattles(b => b + 1); setMeXp(x => x + gain); setMeFocusSecs(f => f + elapsedSecs)
      if (kind === 'won') { setMeWins(w => w + 1); setMeStreak(s => { const ns = s + 1; setMeBest(b => Math.max(b, ns)); return ns }) }
      else { setMeLosses(l => l + 1); setMeStreak(0) }
    }
    setPauseConfirmOpen(false); setBattleOpp(null)
    setArenaPhase('result')
  }

  function backToBattlegroundFromResult() {
    setArenaPhase(null); setResult(null); setView('home')
  }

  // ── Fullscreen arena: countdown / live duel / result ──────────────────────
  if (arenaPhase) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020615] text-center px-6">
        <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6">
          <div className="text-sm font-bold tracking-wider text-white">WYN<span className="text-[#7C4DFF]">KO</span></div>
          {arenaPhase === 'live' && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
              <Ico n="lock" cls="w-3.5 h-3.5" /> Focus Lock on
            </div>
          )}
        </div>

        {arenaPhase === 'countdown' && pendingOpp && (
          <div>
            <p className="text-slate-400 text-sm mb-2"><b className="text-white">{pendingOpp.name}</b> accepted</p>
            <div className="text-8xl font-black text-white mb-3" style={{ textShadow: '0 0 40px rgba(124,77,255,0.5)' }}>{countdownN}</div>
            <p className="text-slate-300 text-sm mb-1">Battle starts now. Don't pause.</p>
            <p className="text-slate-500 text-xs mb-6">Focus Lock is turning on.</p>
            <div className="flex items-center justify-center gap-3">
              <BattleAvatar color="#7C4DFF" variant={0} size={40} />
              <span className="text-slate-500 text-xs font-bold">VS</span>
              <BattleAvatar color={pendingOpp.color} variant={pendingOpp.variant} size={40} />
            </div>
          </div>
        )}

        {arenaPhase === 'live' && battleOpp && (
          <div className="w-full max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-8" style={{ background: 'rgba(124,77,255,0.15)', color: '#C4AAFF', border: '1px solid rgba(124,77,255,0.35)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C4DFF] animate-pulse" /> BATTLE ACTIVE
            </div>
            <div className="flex items-center justify-center gap-8 mb-6">
              <div className="flex flex-col items-center gap-2">
                <BattleAvatar color="#7C4DFF" variant={0} size={88} glow />
                <div className="text-sm font-semibold text-white">You</div>
                <div className="text-[11px] text-slate-500">Your focus time</div>
                <div className="text-3xl font-black text-white" style={{ fontFamily: 'monospace' }}>{baFmtTime(elapsedSecs)}</div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Focusing</div>
              </div>
              <div className="text-slate-600 text-xs font-bold">VS</div>
              <div className="flex flex-col items-center gap-2">
                <BattleAvatar color={battleOpp.color} variant={battleOpp.variant} size={88} glow ringColor={battleOpp.color} />
                <div className="text-sm font-semibold text-white">{battleOpp.name}</div>
                <div className="text-[11px] text-slate-500">{battleOpp.name}'s focus time</div>
                <div className="text-3xl font-black text-white" style={{ fontFamily: 'monospace' }}>{baFmtTime(elapsedSecs)}</div>
                <div className="flex items-center gap-1 text-[11px] text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Focusing</div>
              </div>
            </div>
            <p className="text-slate-500 text-xs mb-5">First person to pause loses.</p>
            <button onClick={requestPause} className="mx-auto flex items-center gap-2 px-8 py-3 rounded-2xl font-bold" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              PAUSE
            </button>
            <p className="text-slate-600 text-[11px] mt-4">Pausing Focus Lock counts as pausing the battle.</p>
            <button onClick={opponentPausesFirst} className="mt-8 text-[11px] text-slate-600 hover:text-slate-400 underline">Simulate: opponent pauses first</button>

            {pauseConfirmOpen && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4">
                <div className="w-full max-w-sm rounded-2xl border bg-[#0B1530] border-[#1E3060] p-6">
                  <h2 className="text-lg font-bold text-white mb-2">Pause and lose the battle?</h2>
                  <p className="text-slate-400 text-sm mb-5">{battleOpp.name} wins the moment you pause. Your {baFmtTime(elapsedSecs)} of focus is still saved.</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={keepFocusing} className="w-full py-2.5 rounded-xl font-bold text-white" style={{ background: '#7C4DFF' }}>Keep focusing</button>
                    <button onClick={confirmPause} className="w-full py-2.5 rounded-xl font-semibold text-sm" style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }}>Pause and lose</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {arenaPhase === 'result' && result && (
          <div className="w-full max-w-md">
            <div className="text-6xl mb-3">{result.kind === 'won' ? '🏆' : '💀'}</div>
            <h1 className="text-3xl font-black text-white mb-1">{result.kind === 'won' ? 'YOU WIN' : 'DEFEAT'}</h1>
            <p className="text-slate-400 text-sm mb-1">{result.kind === 'won' ? 'Your opponent paused first.' : 'You paused first.'}</p>
            <p className="text-slate-500 text-xs mb-6">You vs {result.opp.name}</p>
            <div className="flex items-center justify-center gap-8 mb-6">
              <div><div className="text-[11px] text-slate-500 mb-1">Focus time</div><div className="text-xl font-bold text-white">{baFmtTime(result.elapsed)}</div></div>
              <div><div className="text-[11px] text-slate-500 mb-1">Battle XP</div><div className="text-xl font-bold text-emerald-400">+{result.gain}</div></div>
            </div>
            {(() => {
              const a = baTierInfo(result.before), b = baTierInfo(result.after), promoted = b.i > a.i
              return (
                <div className="mb-6">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(124,77,255,0.15)', color: '#C4AAFF' }}>{b.cur.n}</span>
                    <span className="text-slate-500" style={{ fontFamily: 'monospace' }}>{baFmtXP(result.after)} XP</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1A2845] overflow-hidden">
                    <div className="h-full rounded-full bg-[#7C4DFF]" style={{ width: `${promoted ? b.pct : a.pct}%` }} />
                  </div>
                  <p className="text-[11px] mt-1.5" style={{ color: promoted ? '#4ade80' : '#64748b' }}>
                    {promoted ? `New title unlocked: ${b.cur.n}` : b.next ? `${baFmtXP(b.need)} XP to ${b.next.n}` : 'Top title reached'}
                  </p>
                </div>
              )
            })()}
            <button onClick={backToBattlegroundFromResult} className="w-full py-3 rounded-2xl font-bold text-white" style={{ background: '#7C4DFF' }}>Back to Battleground</button>
          </div>
        )}
      </div>
    )
  }

  const rank = baTierInfo(meXp)
  const earnedTrophies = TROPHY_TIERS.filter((_, i) => meBattles >= BA_MILESTONES[i])
  const boardRows = [
    ...BA_FRIENDS.map(f => ({ id: f.id, name: f.name, color: f.color, variant: f.variant, xp: f.xp, me: false })),
    { id: 'me', name: 'You', color: '#7C4DFF', variant: 0, xp: meXp, me: true },
  ].sort((a, b) => b.xp - a.xp)

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]">
      <Sidebar active="battleground" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
          {view === 'profile' ? (
            <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
              <Ico n="chevL" cls="w-4 h-4" /> Battleground
            </button>
          ) : (
            <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
              <Ico n="chevL" cls="w-4 h-4" /> Home
            </button>
          )}
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5">BATTLEGROUND</div>
            <div className="text-sm font-semibold text-slate-200">Challenge. Compete. Win.</div>
          </div>
          <div className="relative p-2 text-slate-400">
            <Ico n="bell" cls="w-5 h-5" />
            {invites.length > 0 && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-[#7C4DFF]">{invites.length}</div>
            )}
          </div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {view === 'waiting' && pendingOpp && (
            <div className="max-w-md mx-auto text-center py-16">
              <div className="flex items-center justify-center gap-4 mb-6">
                <BattleAvatar color="#7C4DFF" variant={0} size={64} />
                <div className="flex gap-1">{[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#7C4DFF] animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
                <BattleAvatar color={pendingOpp.color} variant={pendingOpp.variant} size={64} glow ringColor={pendingOpp.color} />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Waiting for {pendingOpp.name} to accept</h2>
              <p className="text-slate-400 text-sm mb-6">Once they accept, you both get a 3-2-1 countdown and the battle begins.</p>
              <div className="text-xs text-slate-500 mb-6">Invitation expires in <b className="text-slate-300" style={{ fontFamily: 'monospace' }}>{baFmtTime(expirySecs)}</b></div>
              <button onClick={cancelChallenge} className="px-6 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">Cancel challenge</button>
            </div>
          )}

          {view === 'profile' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="rounded-2xl border p-6 flex items-center gap-5 bg-[#0B1530] border-[#1E3060]">
                <BattleAvatar color="#7C4DFF" variant={0} size={72} glow />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold text-white">You</h1>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: 'rgba(124,77,255,0.15)', color: '#C4AAFF' }}>{rank.cur.n}</span>
                  </div>
                  <div className="text-2xl font-black text-white mb-2">{baFmtXP(meXp)} <span className="text-xs font-normal text-slate-500">Battle XP</span></div>
                  <div className="h-2 rounded-full bg-[#1A2845] overflow-hidden mb-1.5"><div className="h-full rounded-full bg-[#7C4DFF]" style={{ width: `${rank.pct}%` }} /></div>
                  <div className="text-[11px] text-slate-500">{rank.next ? <>{baFmtXP(rank.need)} XP to {rank.next.n}</> : 'Top title reached'}</div>
                </div>
              </div>

              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-white">Battle titles</div>
                  <div className="text-[11px] text-slate-500">Earned with Battle XP</div>
                </div>
                <div className="space-y-2">
                  {BA_TIERS.map((t, i) => {
                    const done = i < rank.i, cur = i === rank.i
                    return (
                      <div key={t.n} className="flex items-center gap-3 py-1.5">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: done ? '#4ade80' : cur ? '#7C4DFF' : '#1A2845', color: done || cur ? '#020615' : '#64748b' }}>
                          {done ? '✓' : ''}
                        </div>
                        <div className={`text-sm font-semibold flex-1 ${cur ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500'}`}>{t.n}</div>
                        <div className="text-[11px] text-slate-500" style={{ fontFamily: 'monospace' }}>{baFmtXP(t.min)} XP</div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1A2845] text-[11px] text-slate-500">
                  <span>Win a battle <b className="text-emerald-400">+{BA_XP_WIN} XP</b></span>
                  <span>Lose a battle <b className="text-slate-400">+{BA_XP_LOSS} XP</b></span>
                </div>
              </div>

              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]">
                <div className="text-sm font-bold text-white mb-4">Battle stats</div>
                <BAStatGrid battles={meBattles} wins={meWins} losses={meLosses} streak={meStreak} best={meBest} focusSecs={meFocusSecs} xp={meXp} />
                <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
                  <span><b className="text-emerald-400">{meWins}</b> wins</span>
                  <span><b className="text-red-400">{meLosses}</b> losses</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex mt-1.5 bg-[#1A2845]">
                  <div className="h-full bg-emerald-400" style={{ width: `${meBattles > 0 ? Math.round((meWins / meBattles) * 100) : 0}%` }} />
                  <div className="h-full flex-1" style={{ background: 'rgba(248,113,113,0.7)' }} />
                </div>
              </div>

              {earnedTrophies.length > 0 && (
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]">
                  <div className="text-sm font-bold text-white mb-4">Trophies</div>
                  <div className="grid grid-cols-4 gap-3">
                    {TROPHY_TIERS.map(t => {
                      const earned = earnedTrophies.includes(t)
                      return (
                        <div key={t.tier} className="rounded-xl border p-3 text-center" style={{ background: earned ? t.bg : 'rgba(255,255,255,0.02)', borderColor: earned ? t.border : '#1A2845', opacity: earned ? 1 : 0.4 }}>
                          <img src={t.img} alt={t.tier} className="w-10 h-10 mx-auto mb-1.5 object-contain" />
                          <div className="text-[10px] text-slate-400">{t.sub}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'home' && (
            <>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#1E3060,rgba(124,77,255,0.25))', border: '1px solid #4A3A88', boxShadow: '0 0 20px #1A2845' }}>⚔️</div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-white">Battleground</h1>
                  <p className="text-slate-400 text-sm">Challenge your friends. Stay focused. Don't pause.</p>
                </div>
                <button onClick={() => setView('profile')} className="text-right hover:opacity-80 transition-opacity">
                  <div className="text-[10px] text-slate-500 mb-0.5">Your battle title</div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-sm font-bold" style={{ color: '#C4AAFF' }}>{rank.cur.n}</span>
                    <span className="text-xs text-slate-500">{baFmtXP(meXp)} XP</span>
                  </div>
                </button>
              </div>

              <div className="rounded-2xl border p-6 bg-[#0B1530] border-[#1E3060]">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h2 className="text-lg font-bold text-white mb-1.5">Ready for a challenge?</h2>
                    <p className="text-slate-400 text-sm mb-4">Challenge a friend and see who can stay focused longer.</p>
                    <button onClick={openPicker} className="px-5 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: '#7C4DFF' }}>⚔️ Challenge friend</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <BattleAvatar color="#7C4DFF" variant={0} size={56} />
                    <span className="text-slate-600 text-xs font-bold">VS</span>
                    <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#1E3060] flex items-center justify-center text-slate-600">?</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 pt-5 border-t border-[#1A2845] text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5"><Ico n="check" cls="w-3.5 h-3.5 text-emerald-400" /> You both start together</span>
                  <span className="flex items-center gap-1.5"><Ico n="lock" cls="w-3.5 h-3.5" /> Focus Lock stays on</span>
                  <span className="flex items-center gap-1.5">⏸ First to pause loses</span>
                </div>
              </div>

              {invites.length > 0 && (
                <div className="rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1E3060]">
                  <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                    <div className="text-sm font-bold text-white">Battle Invitations</div>
                    <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1A2845] text-[#C4AAFF]">{invites.length} pending</div>
                  </div>
                  <div className="px-4 pb-4 space-y-2">
                    {invites.map(inv => {
                      const f = byId(inv.id)
                      return (
                        <div key={inv.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'rgba(124,77,255,0.06)' }}>
                          <BattleAvatar color={f.color} variant={f.variant} size={36} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white">{f.name} <span className="text-slate-400 font-normal">challenged you</span></div>
                            <div className="text-[11px] text-slate-500">{inv.ago}</div>
                          </div>
                          <button onClick={() => acceptInvite(inv.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#7C4DFF' }}>Accept</button>
                          <button onClick={() => rejectInvite(inv.id)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 border border-[#1A2845]">Reject</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-white">Your battle stats</div>
                  <button onClick={() => setView('profile')} className="text-[11px] font-semibold" style={{ color: '#C4AAFF' }}>View profile</button>
                </div>
                <BAStatGrid battles={meBattles} wins={meWins} losses={meLosses} streak={meStreak} best={meBest} focusSecs={meFocusSecs} xp={meXp} />
              </div>

              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-white">🏆 Friends leaderboard</div>
                  <div className="text-[11px] text-slate-500">Ranked by Battle XP</div>
                </div>
                <div className="space-y-1">
                  {boardRows.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-3 py-2 px-2 rounded-xl" style={r.me ? { background: 'rgba(124,77,255,0.08)' } : undefined}>
                      <div className="w-5 text-center text-xs font-bold text-slate-500">{i + 1}</div>
                      <BattleAvatar color={r.color} variant={r.variant} size={32} />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">{r.name}</span>
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(124,77,255,0.15)', color: '#C4AAFF' }}>{baTierInfo(r.xp).cur.n}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-300" style={{ fontFamily: 'monospace' }}>{baFmtXP(r.xp)} <span className="text-slate-600 font-normal">XP</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4" onClick={closePicker}>
          <div className="w-full max-w-md rounded-2xl border bg-[#0B1530] border-[#1E3060] p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-base font-bold text-white">Challenge a friend</div>
                <div className="text-xs text-slate-500 mt-0.5">Search by username or pick from your friends.</div>
              </div>
              <button onClick={closePicker} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
            </div>
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2 mb-3 border-[#1A2845]">
              <Ico n="search" cls="w-4 h-4 text-slate-500" />
              <input value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} placeholder="Search username" className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 outline-none" />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 mb-3">
              {BA_FRIENDS.filter(f => !pickerQuery.trim() || f.name.toLowerCase().includes(pickerQuery.trim().toLowerCase())).map(f => {
                const offline = f.status !== 'online'
                const sel = pickerSel === f.id
                return (
                  <button key={f.id} disabled={offline} onClick={() => setPickerSel(f.id)}
                    className={`w-full flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${offline ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'}`}
                    style={sel ? { background: 'rgba(124,77,255,0.12)', border: '1px solid rgba(124,77,255,0.4)' } : { border: '1px solid transparent' }}>
                    <BattleAvatar color={f.color} variant={f.variant} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{f.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${f.status === 'online' ? 'bg-emerald-400' : f.status === 'busy' ? 'bg-amber-400' : 'bg-slate-600'}`} />
                        {f.status === 'online' ? 'Online' : f.status === 'busy' ? 'In session' : 'Offline'}
                      </div>
                    </div>
                    {sel && <Ico n="check" cls="w-4 h-4 text-[#7C4DFF]" />}
                  </button>
                )
              })}
            </div>
            <div className="flex items-start gap-2 text-[11px] text-slate-500 mb-4">
              <Ico n="lock" cls="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>First person to pause loses. Focus Lock turns on for both of you.</span>
            </div>
            <div className="flex gap-2">
              <button onClick={closePicker} className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 border-[#1A2845]">Cancel</button>
              <button onClick={sendChallenge} disabled={!pickerSel} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: '#7C4DFF' }}>
                {pickerSel ? `Challenge ${byId(pickerSel).name}` : 'Send challenge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Settings Page ─────────────────────────────────────────────────────────────

function SettingsPage({ onNavigate, profile }: { onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  type SettingsTab = 'profile' | 'account' | 'notifications' | 'privacy' | 'study' | 'about'

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  // Profile state
  // displayName/avatar seed from the real signed-in account (same
  // profile useHomeData already loads for Home/Sidebar); the rest of
  // this form (username, bio, gender, age, course, school, phone,
  // email, dailyGoal) is still local-only mock state - a real Settings
  // read/write pass is a separate, larger module than this name fix.
  const { avatar: selectedAvatar, setAvatar: setSelectedAvatar } = useContext(UserAvatarCtx)
  const [displayName, setDisplayName] = useState(profile?.displayName || 'Jatin Sinsinwar')
  const [username, setUsername] = useState('jatin_sinsinwar')
  const [bio, setBio] = useState('Aspiring engineer. JEE 2026.')
  const [gender, setGender] = useState('Male')
  const [age, setAge] = useState('18')
  const [course, setCourse] = useState('Engineering')
  const [classYear, setClassYear] = useState('12th Grade')
  const [school, setSchool] = useState('Delhi Public School')
  const [targetExam, setTargetExam] = useState('JEE Advanced 2026')
  const [phone, setPhone] = useState('+91 98765 43210')
  const [email, setEmail] = useState('jatin@example.com')
  const [dailyGoal, setDailyGoal] = useState('6')
  const [studyReminders, setStudyReminders] = useState(true)
  const [battleNotifs, setBattleNotifs] = useState(true)
  const [roomNotifs, setRoomNotifs] = useState(true)
  const [achievementNotifs, setAchievementNotifs] = useState(true)
  const [profilePublic, setProfilePublic] = useState(true)
  const [showStreak, setShowStreak] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const [allowBattleInvites, setAllowBattleInvites] = useState(true)
  const [soundEffects, setSoundEffects] = useState(true)
  const [focusMode, setFocusMode] = useState(false)

  function saveProfile() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  // profile arrives asynchronously (a fresh sign-in navigating straight
  // to Settings can beat useHomeData's fetch) - resync once it lands,
  // but only if the person hasn't already typed something of their own
  // in this field this session.
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  useEffect(() => {
    if (!displayNameTouched && profile?.displayName) setDisplayName(profile.displayName)
  }, [profile?.displayName, displayNameTouched])

  const TABS: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'account', label: 'Account', icon: '🔐' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'privacy', label: 'Privacy', icon: '🛡️' },
    { id: 'study', label: 'Study Prefs', icon: '📚' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
  ]

  function Toggle({ val, onChange }: { val: boolean; onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!val)}
        className="w-11 h-6 rounded-full transition-all flex-shrink-0 relative"
        style={{ background: val ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'rgba(100,116,139,0.35)', boxShadow: val ? '0 0 10px #2855CC' : 'none' }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all"
          style={{ left: val ? 'calc(100% - 22px)' : '2px' }} />
      </button>
    )
  }

  function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
      <div className="flex items-center justify-between py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
        <div>
          <div className="text-sm font-medium text-slate-200">{label}</div>
          {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
        <div className="ml-4 flex-shrink-0">{children}</div>
      </div>
    )
  }

  function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1A2845]" >
        <div className="px-5 pt-5 pb-1">
          <div className="text-[10px] font-mono tracking-[0.18em] text-violet-400 mb-4">{title}</div>
          {children}
        </div>
        <div className="h-2" />
      </div>
    )
  }

  function FieldInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
      <div className="py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
        <div className="text-[10px] text-slate-500 font-mono mb-1.5">{label}</div>
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 transition-colors focus:border-violet-500/50 border-[#1A2845]"
           />
      </div>
    )
  }

  function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
    return (
      <div className="py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
        <div className="text-[10px] text-slate-500 font-mono mb-1.5">{label}</div>
        <div className="flex flex-wrap gap-2">
          {options.map(o => (
            <button key={o} onClick={() => onChange(o)}
              className="px-3.5 py-1.5 rounded-xl border text-sm font-medium transition-all"
              style={{ background: value === o ? '#1A2845' : '#0B1530', color: value === o ? '#C4AAFF' : '#4E5E84', borderColor: value === o ? '#4A3A88' : 'rgba(26,40,69,0.55)' }}>
              {o}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]" >
      <Sidebar active="settings" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" >SETTINGS</div>
            <div className="text-sm font-semibold text-slate-200">Manage your account & preferences.</div>
          </div>
          {saved && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }}>
              ✓ Changes saved
            </div>
          )}
          <UserAvatar size={32} />
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Settings nav sidebar */}
          <div className="w-52 flex-shrink-0 border-r py-4 space-y-1 overflow-y-auto px-3 border-[rgba(26,40,69,0.55)] bg-[rgba(6,8,15,0.5)]"
            >
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                style={{
                  background: activeTab === tab.id ? 'rgba(26,40,69,0.55)' : 'transparent',
                  color: activeTab === tab.id ? '#C4AAFF' : '#4E5E84',
                  border: `1px solid ${activeTab === tab.id ? '#1E3060' : 'transparent'}`,
                }}>
                <span className="text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            <div className="pt-4 mt-4 border-t px-1 border-[rgba(26,40,69,0.55)]" >
              <button className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all text-left text-red-400 hover:bg-red-500/10">
                <span className="text-base">🚪</span> Log Out
              </button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">Profile</h2>
                  <p className="text-slate-400 text-sm mt-0.5">How others see you on Wynko.</p>
                </div>

                {/* Avatar picker */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.18em] text-violet-400 mb-4">PROFILE PICTURE</div>
                  <div className="flex items-center gap-6">
                    {/* Big avatar preview */}
                    <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0"
                      style={{ border: '2px solid rgba(124,77,255,0.5)', boxShadow: '0 0 24px rgba(124,77,255,0.3)' }}>
                      <img src={selectedAvatar} alt="Selected avatar" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] text-slate-500 mb-3">Choose avatar</div>
                      <div className="grid grid-cols-6 gap-2">
                        {AVATAR_OPTIONS.map((av, i) => (
                          <button key={i} onClick={() => setSelectedAvatar(av)}
                            className="rounded-xl overflow-hidden transition-all hover:scale-105 border-2"
                            style={{ borderColor: selectedAvatar === av ? '#8B5CFF' : 'transparent', boxShadow: selectedAvatar === av ? '0 0 12px rgba(139,92,255,0.6)' : 'none' }}>
                            <img src={av} alt={`Avatar ${i + 1}`} className="w-full aspect-square object-contain bg-[rgba(26,40,69,0.4)]"  />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <SectionCard title="PERSONAL INFORMATION">
                  <FieldInput label="DISPLAY NAME" value={displayName} onChange={v => { setDisplayName(v); setDisplayNameTouched(true) }} placeholder="Your full name" />
                  <FieldInput label="USERNAME" value={username} onChange={setUsername} placeholder="@username" />
                  <FieldInput label="BIO" value={bio} onChange={setBio} placeholder="Tell others about yourself..." />
                  <SelectInput label="GENDER" value={gender} onChange={setGender} options={['Male', 'Female', 'Non-binary', 'Prefer not to say']} />
                  <FieldInput label="AGE" value={age} onChange={setAge} type="number" placeholder="Your age" />
                </SectionCard>

                <SectionCard title="ACADEMIC INFORMATION">
                  <FieldInput label="SCHOOL / INSTITUTION" value={school} onChange={setSchool} placeholder="Your school or college" />
                  <SelectInput label="CLASS / YEAR" value={classYear} onChange={setClassYear} options={['9th Grade', '10th Grade', '11th Grade', '12th Grade', '1st Year', '2nd Year', '3rd Year', '4th Year']} />
                  <SelectInput label="COURSE / STREAM" value={course} onChange={setCourse} options={['Engineering', 'Medical', 'Commerce', 'Arts', 'Science', 'Law', 'Other']} />
                  <FieldInput label="TARGET EXAM" value={targetExam} onChange={setTargetExam} placeholder="e.g. JEE Advanced, NEET, UPSC" />
                </SectionCard>

                <button onClick={saveProfile}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                  Save Profile Changes
                </button>
              </>
            )}

            {/* ── ACCOUNT TAB ── */}
            {activeTab === 'account' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">Account</h2>
                  <p className="text-slate-400 text-sm mt-0.5">Manage your login details and security.</p>
                </div>

                <SectionCard title="CONTACT INFORMATION">
                  <FieldInput label="EMAIL ADDRESS" value={email} onChange={setEmail} type="email" placeholder="your@email.com" />
                  <FieldInput label="PHONE NUMBER" value={phone} onChange={setPhone} type="tel" placeholder="+91 00000 00000" />
                </SectionCard>

                <SectionCard title="SECURITY">
                  <div className="py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">CURRENT PASSWORD</div>
                    <input type="password" placeholder="Enter current password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       />
                  </div>
                  <div className="py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">NEW PASSWORD</div>
                    <input type="password" placeholder="Enter new password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       />
                  </div>
                  <div className="py-3.5">
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">CONFIRM NEW PASSWORD</div>
                    <input type="password" placeholder="Confirm new password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]"
                       />
                  </div>
                </SectionCard>

                <SectionCard title="CONNECTED ACCOUNTS">
                  {[
                    { name: 'Google', icon: '🔵', connected: true },
                    { name: 'Discord', icon: '🟣', connected: false },
                    { name: 'GitHub', icon: '⚫', connected: false },
                  ].map(acc => (
                    <div key={acc.name} className="flex items-center justify-between py-3.5 border-b last:border-0 border-[rgba(26,40,69,0.55)]" >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-slate-200">{acc.name}</div>
                          <div className="text-[11px]" style={{ color: acc.connected ? '#19D3A2' : '#4E5E84' }}>{acc.connected ? 'Connected' : 'Not connected'}</div>
                        </div>
                      </div>
                      <button className="px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all hover:border-violet-500/40"
                        style={{ borderColor: '#1A2845', color: acc.connected ? '#F87171' : '#9B6CFF' }}>
                        {acc.connected ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  ))}
                </SectionCard>

                <button onClick={saveProfile}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                  Save Account Changes
                </button>

                <div className="rounded-2xl border p-5 bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.2)]" >
                  <div className="text-[10px] font-mono tracking-[0.18em] text-red-400 mb-3">DANGER ZONE</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-red-300">Delete Account</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Permanently delete your Wynko account and all data.</div>
                    </div>
                    <button className="px-4 py-2 rounded-xl text-[12px] font-bold text-red-400 border transition-all hover:bg-red-500/10 border-[rgba(239,68,68,0.35)]"
                      >Delete</button>
                  </div>
                </div>
              </>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {activeTab === 'notifications' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">Notifications</h2>
                  <p className="text-slate-400 text-sm mt-0.5">Control what alerts you receive.</p>
                </div>
                <SectionCard title="STUDY ALERTS">
                  <SettingRow label="Study Reminders" sub="Get reminded to start your study sessions"><Toggle val={studyReminders} onChange={setStudyReminders} /></SettingRow>
                  <SettingRow label="Focus Session Alerts" sub="Notified when your focus timer ends"><Toggle val={focusMode} onChange={setFocusMode} /></SettingRow>
                  <SettingRow label="Streak Alerts" sub="Don't break your study streak"><Toggle val={showStreak} onChange={setShowStreak} /></SettingRow>
                </SectionCard>
                <SectionCard title="SOCIAL ALERTS">
                  <SettingRow label="Battle Invitations" sub="Get notified when someone challenges you"><Toggle val={battleNotifs} onChange={setBattleNotifs} /></SettingRow>
                  <SettingRow label="Study Room Invites" sub="Notified when friends invite you to rooms"><Toggle val={roomNotifs} onChange={setRoomNotifs} /></SettingRow>
                  <SettingRow label="Achievements" sub="Get notified for new badges and trophies"><Toggle val={achievementNotifs} onChange={setAchievementNotifs} /></SettingRow>
                </SectionCard>
                <SectionCard title="APP SOUNDS">
                  <SettingRow label="Sound Effects" sub="Play sounds for timers and events"><Toggle val={soundEffects} onChange={setSoundEffects} /></SettingRow>
                </SectionCard>
              </>
            )}

            {/* ── PRIVACY TAB ── */}
            {activeTab === 'privacy' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">Privacy</h2>
                  <p className="text-slate-400 text-sm mt-0.5">Control who can see your data.</p>
                </div>
                <SectionCard title="PROFILE VISIBILITY">
                  <SettingRow label="Public Profile" sub="Anyone on Wynko can see your profile"><Toggle val={profilePublic} onChange={setProfilePublic} /></SettingRow>
                  <SettingRow label="Show Study Streak" sub="Display your streak on your public profile"><Toggle val={showStreak} onChange={setShowStreak} /></SettingRow>
                  <SettingRow label="Show Study Stats" sub="Others can see your study hours and progress"><Toggle val={showStats} onChange={setShowStats} /></SettingRow>
                </SectionCard>
                <SectionCard title="INTERACTIONS">
                  <SettingRow label="Allow Battle Invites" sub="Let other users challenge you to battles"><Toggle val={allowBattleInvites} onChange={setAllowBattleInvites} /></SettingRow>
                  <SettingRow label="Allow Room Invites" sub="Let others invite you to study rooms"><Toggle val={roomNotifs} onChange={setRoomNotifs} /></SettingRow>
                </SectionCard>
                <SectionCard title="DATA & PRIVACY">
                  {[
                    { label: 'Download My Data', sub: 'Export all your study data and history', action: 'Download' },
                    { label: 'Clear Study History', sub: 'Remove all session and progress records', action: 'Clear' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between py-3.5 border-b last:border-0 border-[rgba(26,40,69,0.55)]" >
                      <div>
                        <div className="text-sm font-medium text-slate-200">{item.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.sub}</div>
                      </div>
                      <button className="px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold text-violet-400 hover:border-violet-500/50 transition-all border-[#1E3060]"
                        >{item.action}</button>
                    </div>
                  ))}
                </SectionCard>
              </>
            )}

            {/* ── STUDY PREFS TAB ── */}
            {activeTab === 'study' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">Study Preferences</h2>
                  <p className="text-slate-400 text-sm mt-0.5">Personalize your study experience.</p>
                </div>
                <SectionCard title="DAILY GOALS">
                  <div className="py-3.5 border-b border-[rgba(26,40,69,0.55)]" >
                    <div className="text-[10px] text-slate-500 font-mono mb-2">DAILY STUDY GOAL (HOURS)</div>
                    <div className="flex gap-2 flex-wrap">
                      {['2', '4', '6', '8', '10', '12'].map(h => (
                        <button key={h} onClick={() => setDailyGoal(h)}
                          className="px-4 py-2 rounded-xl border text-sm font-semibold transition-all"
                          style={{ background: dailyGoal === h ? '#1A2845' : '#0B1530', color: dailyGoal === h ? '#C4AAFF' : '#4E5E84', borderColor: dailyGoal === h ? '#4A3A88' : 'rgba(26,40,69,0.55)' }}>
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                </SectionCard>
                <SectionCard title="FOCUS SESSION">
                  <SettingRow label="Auto-start Breaks" sub="Automatically start break timer after focus"><Toggle val={focusMode} onChange={setFocusMode} /></SettingRow>
                  <SettingRow label="Focus Mode (block distractions)" sub="Lock notifications during focus sessions"><Toggle val={studyReminders} onChange={setStudyReminders} /></SettingRow>
                  <SettingRow label="Sound during Focus" sub="Play ambient sounds during study sessions"><Toggle val={soundEffects} onChange={setSoundEffects} /></SettingRow>
                </SectionCard>
                <SectionCard title="PREFERRED TECHNIQUE">
                  {[
                    { name: 'Pomodoro', sub: '25 min focus, 5 min break' },
                    { name: 'Deep Work', sub: '90 min sessions, longer breaks' },
                    { name: 'Time Blocking', sub: 'Fixed time slots per subject' },
                    { name: 'Custom', sub: 'Set your own timer intervals' },
                  ].map((t, i) => (
                    <div key={t.name} className="flex items-center justify-between py-3.5 border-b last:border-0 border-[rgba(26,40,69,0.55)]" >
                      <div>
                        <div className="text-sm font-medium text-slate-200">{t.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{t.sub}</div>
                      </div>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: i === 0 ? '#7C4DFF' : '#1E3060' }}>
                        {i === 0 && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                      </div>
                    </div>
                  ))}
                </SectionCard>
                <button onClick={saveProfile}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                  Save Study Preferences
                </button>
              </>
            )}

            {/* ── ABOUT TAB ── */}
            {activeTab === 'about' && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-white">About Wynko</h2>
                  <p className="text-slate-400 text-sm mt-0.5">App info and legal.</p>
                </div>
                <div className="rounded-2xl border p-8 text-center bg-[#0B1530] border-[#1A2845]" >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 32px rgba(124,77,255,0.6), 0 0 64px rgba(40,85,204,0.3)' }}>W</div>
                  <div className="text-xl font-black text-white mb-1">Wynko</div>
                  <div className="text-[11px] text-slate-500 font-mono mb-4">VERSION 1.0.0 (BETA)</div>
                  <div className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">Better Focus. Better Results. Study smarter with your community.</div>
                </div>
                <SectionCard title="LEGAL & INFO">
                  {[
                    { label: 'Terms of Service', icon: '📄' },
                    { label: 'Privacy Policy', icon: '🔒' },
                    { label: 'Licenses', icon: '📋' },
                    { label: 'Contact Support', icon: '💬' },
                    { label: 'Rate Wynko ⭐', icon: '🌟' },
                  ].map(item => (
                    <button key={item.label} className="w-full flex items-center justify-between py-3.5 border-b last:border-0 text-left group border-[rgba(26,40,69,0.55)]" >
                      <div className="flex items-center gap-3">
                        <span className="text-base">{item.icon}</span>
                        <span className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{item.label}</span>
                      </div>
                      <Ico n="chevR" cls="w-4 h-4 text-slate-600" />
                    </button>
                  ))}
                </SectionCard>
              </>
            )}

            <div className="h-6" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WYNKOINS Page ─────────────────────────────────────────────────────────────

function WynkoinsPage({ onNavigate, profile }: { onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  const [balance, setBalance] = useState(150)
  const [adsFree, setAdsFree] = useState(false)
  const [adsFreeExpiry, setAdsFreeExpiry] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [spending, setSpending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [history, setHistory] = useState<{ label: string; amount: number; date: string; type: 'credit' | 'debit' }[]>([
    { label: 'Welcome bonus', amount: 100, date: 'Sep 1, 2026', type: 'credit' },
    { label: 'Friend streak (EXAMPLE)', amount: 50, date: 'Sep 5, 2026', type: 'credit' },
  ])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  function handleBuy(pack: { id: string; coins: number; price: string }) {
    setBuying(pack.id)
    setTimeout(() => {
      setBuying(null)
      setBalance(b => b + pack.coins)
      const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      setHistory(h => [{ label: `Purchased ${pack.coins} WYNKOINS`, amount: pack.coins, date: now, type: 'credit' }, ...h])
      showToast(`+${pack.coins} WYNKOINS added to your wallet!`, 'success')
    }, 1200)
  }

  function handleUnlockAdFree() {
    if (balance < 199) { showToast('Not enough WYNKOINS. Buy more to unlock!', 'error'); return }
    setSpending(true)
    setTimeout(() => {
      setSpending(false)
      setBalance(b => b - 199)
      setAdsFree(true)
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 1)
      const expiryStr = expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      setAdsFreeExpiry(expiryStr)
      const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      setHistory(h => [{ label: 'Ad-free for 1 month', amount: 199, date: now, type: 'debit' }, ...h])
      showToast('🎉 Ads removed for 1 month!', 'success')
    }, 1000)
  }

  const PACKS = [
    {
      id: 'pack_199', coins: 199, price: '₹29', priceNum: 29,
      badge: '', color: '#7C4DFF', glow: '#2855CC',
      grad: 'linear-gradient(135deg,#7C4DFF,#5C35CC)',
      perCoin: '14.6p/coin', popular: false,
    },
    {
      id: 'pack_399', coins: 399, price: '₹49', priceNum: 49,
      badge: 'BEST VALUE', color: '#19B5E6', glow: 'rgba(25,181,230,0.40)',
      grad: 'linear-gradient(135deg,#0F99CC,#0C7FAA)',
      perCoin: '12.3p/coin', popular: true,
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]" >
      <Sidebar active="wynkoins" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" >WYNKOINS</div>
            <div className="text-sm font-semibold text-slate-200">Buy coins. Unlock perks.</div>
          </div>
          {/* Balance pill */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.35)]"
            >
            <img src="/wynkoin.png" alt="Wynkoin" className="w-5 h-5 object-contain flex-shrink-0" />
            <span className="text-base font-black text-amber-400" >{balance}</span>
            <span className="text-[10px] text-amber-600 font-semibold">WYNKOINS</span>
          </div>
          <UserAvatar size={32} />
        </header>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl transition-all"
            style={{
              background: toast.type === 'success' ? 'rgba(25,211,162,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${toast.type === 'success' ? 'rgba(25,211,162,0.40)' : 'rgba(239,68,68,0.4)'}`,
              color: toast.type === 'success' ? '#19D3A2' : '#F87171',
              backdropFilter: 'blur(12px)',
            }}>
            {toast.msg}
          </div>
        )}

        <main className="flex-1 overflow-y-auto">

          {/* Hero */}
          <div className="relative overflow-hidden px-8 py-8 border-b"
            style={{ background: 'linear-gradient(130deg,#080B1A,#12083A 60%,#080B1A)', borderColor: 'rgba(245,158,11,0.15)' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 60% 50%,rgba(245,158,11,0.1),transparent 65%)' }} />
            <div className="relative z-10 flex items-center gap-10">
              {/* Giant coin */}
              <div className="flex-shrink-0 w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', boxShadow: '0 0 48px rgba(245,158,11,0.5), 0 0 96px rgba(245,158,11,0.2)' }}>
                <img src="/wynkoin.png" alt="Wynkoin" className="w-16 h-16 object-contain" />
              </div>
              <div>
                <div className="text-[10px] font-mono tracking-[0.28em] text-amber-500 mb-2">WYNKO VIRTUAL CURRENCY</div>
                <h1 className="text-3xl font-black text-white mb-1">WYNKOINS</h1>
                <p className="text-slate-400 text-sm max-w-lg leading-relaxed">Buy WYNKOINS to unlock exclusive perks inside Wynko — remove ads, unlock features, and more coming soon.</p>
              </div>
              <div className="ml-auto flex-shrink-0 text-right">
                <div className="text-[10px] text-slate-500 font-mono mb-1">YOUR BALANCE</div>
                <div className="text-5xl font-black text-amber-400" >{balance}</div>
                <div className="text-[11px] text-amber-600 mt-0.5">WYNKOINS</div>
              </div>
            </div>
          </div>

          <div className="flex gap-5 px-6 py-5 items-start">

            {/* Left column */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* ── BUY WYNKOINS ── */}
              <div>
                <div className="text-[10px] font-mono tracking-[0.2em] text-amber-500 mb-3">BUY WYNKOINS</div>
                <div className="grid grid-cols-2 gap-4">
                  {PACKS.map(pack => (
                    <div key={pack.id} className="relative rounded-2xl border overflow-hidden"
                      style={{ borderColor: pack.popular ? pack.color + '60' : '#1A2845', background: '#0B1530', boxShadow: pack.popular ? `0 0 32px ${pack.glow}` : 'none' }}>
                      {pack.popular && (
                        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: pack.grad }} />
                      )}
                      {pack.badge && (
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest"
                          style={{ background: pack.grad, color: '#fff' }}>{pack.badge}</div>
                      )}
                      <div className="p-6">
                        {/* Coin visual */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                            style={{ background: `${pack.color}20`, border: `1.5px solid ${pack.color}50` }}>
                            <img src="/wynkoin.png" alt="Wynkoin" className="w-16 h-16 object-contain" />
                          </div>
                          <div>
                            <div className="text-3xl font-black text-white" >{pack.coins}</div>
                            <div className="text-[10px] text-slate-500">WYNKOINS · {pack.perCoin}</div>
                          </div>
                        </div>
                        <div className="text-2xl font-black mb-1" style={{ color: pack.color }}>{pack.price}</div>
                        <div className="text-[11px] text-slate-500 mb-5">one-time purchase</div>
                        <button
                          onClick={() => handleBuy(pack)}
                          disabled={buying === pack.id}
                          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
                          style={{ background: pack.grad, boxShadow: `0 0 20px ${pack.glow}`, opacity: buying === pack.id ? 0.7 : 1 }}>
                          {buying === pack.id
                            ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Processing...</>
                            : <>Buy {pack.coins} WYNKOINS for {pack.price}</>}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── SPEND WYNKOINS ── */}
              <div>
                <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">SPEND WYNKOINS</div>
                <div className="rounded-2xl border overflow-hidden" style={{ background: '#0B1530', borderColor: adsFree ? 'rgba(25,211,162,0.40)' : '#1A2845' }}>
                  {adsFree && <div className="h-0.5" style={{ background: 'linear-gradient(90deg,#19D3A2,#0DAE86)' }} />}
                  <div className="p-6 flex items-center gap-5">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: adsFree ? 'rgba(25,211,162,0.12)' : 'rgba(26,40,69,0.55)', border: `1.5px solid ${adsFree ? 'rgba(25,211,162,0.40)' : '#1E3060'}` }}>
                      🚫
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-base font-black text-white">Remove Ads</div>
                        {adsFree && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(25,211,162,0.15)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }}>ACTIVE</span>}
                      </div>
                      <div className="text-sm text-slate-400 mb-2">Enjoy Wynko completely ad-free for <span className="text-white font-semibold">1 full month</span>.</div>
                      {adsFree && adsFreeExpiry && (
                        <div className="text-[11px] font-mono text-emerald-400">Ad-free active until {adsFreeExpiry}</div>
                      )}
                      {!adsFree && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-black text-lg" >199</span>
                          <span className="text-[11px] text-amber-600">WYNKOINS</span>
                          {balance < 199 && <span className="text-[10px] text-red-400 ml-1">— need {199 - balance} more</span>}
                        </div>
                      )}
                    </div>
                    {!adsFree ? (
                      <button
                        onClick={handleUnlockAdFree}
                        disabled={spending || balance < 199}
                        className="flex-shrink-0 px-5 py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
                        style={{
                          background: balance >= 199 ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'rgba(30,30,50,0.8)',
                          color: balance >= 199 ? '#fff' : '#4E5E84',
                          border: balance >= 199 ? 'none' : '1px solid #1A2845',
                          boxShadow: balance >= 199 ? '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' : 'none',
                        }}>
                        {spending ? 'Unlocking…' : balance >= 199 ? (<>Unlock for 199 <img src="/wynkoin.png" alt="Wynkoin" className="w-4 h-4 object-contain inline-block" style={{ verticalAlign: '-3px' }} /></>) : 'Not enough coins'}
                      </button>
                    ) : (
                      <div className="flex-shrink-0 text-2xl">✅</div>
                    )}
                  </div>
                </div>

                {/* More perks coming soon */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {[
                    { icon: '⭐', label: 'Premium Themes', coins: '???', soon: true },
                    { icon: '🏆', label: 'Exclusive Badges', coins: '???', soon: true },
                  ].map(p => (
                    <div key={p.label} className="rounded-xl border p-4 flex items-center gap-3 opacity-50"
                      style={{ background: '#0B1530', borderColor: 'rgba(26,40,69,0.55)', borderStyle: 'dashed' }}>
                      <span className="text-2xl">{p.icon}</span>
                      <div>
                        <div className="text-sm font-bold text-slate-300">{p.label}</div>
                        <div className="text-[10px] text-slate-600">Coming soon</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="w-72 flex-shrink-0 space-y-4">

              {/* Balance card */}
              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[rgba(245,158,11,0.35)]" >
                <div className="text-[10px] font-mono tracking-[0.2em] text-amber-500 mb-3">WALLET</div>
                <div className="flex items-end gap-2 mb-1">
                  <div className="text-5xl font-black text-amber-400" >{balance}</div>
                  <div className="text-[11px] text-amber-600 mb-2">WYNKOINS</div>
                </div>
                <div className="w-full rounded-full h-2 mb-3 bg-[rgba(245,158,11,0.12)]" >
                  <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (balance / 500) * 100)}%`, background: 'linear-gradient(90deg,#F59E0B,#D97706)' }} />
                </div>
                <div className="text-[10px] text-slate-600 mb-4">{balance < 199 ? `${199 - balance} more coins needed to remove ads` : 'Enough to remove ads!'}</div>
                {adsFree && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border mb-3 bg-[rgba(25,211,162,0.08)] border-[rgba(25,211,162,0.30)]"
                    >
                    <span>🚫</span>
                    <div className="text-[11px] text-emerald-400 font-semibold">Ad-free until {adsFreeExpiry}</div>
                  </div>
                )}
                <button onClick={() => onNavigate('earn')} className="w-full py-2 rounded-xl border text-[12px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-all border-[#1E3060]"
                  >
                  Earn free WYNKOINS →
                </button>
              </div>

              {/* Transaction history */}
              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">TRANSACTION HISTORY</div>
                {history.length === 0 ? (
                  <div className="text-center py-6 text-slate-600 text-[12px]">No transactions yet</div>
                ) : (
                  <div className="space-y-0">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0 border-[rgba(26,40,69,0.55)]"
                        >
                        <div>
                          <div className="text-[12px] font-medium text-slate-300">{h.label}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{h.date}</div>
                        </div>
                        <div className="text-sm font-black" style={{ color: h.type === 'credit' ? '#19D3A2' : '#F87171' }}>
                          {h.type === 'credit' ? '+' : '−'}{h.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* How to earn free */}
              <div className="rounded-2xl border p-5 bg-[#0B1530] border-[rgba(26,40,69,0.55)]" >
                <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">EARN FREE WYNKOINS</div>
                <div className="space-y-2.5">
                  {[
                    { icon: '🎁', label: 'Invite a friend', sub: '+50 coins after their 3-day streak' },
                    { icon: '🔥', label: 'Daily study streak', sub: 'Coming soon' },
                    { icon: '👑', label: 'WynkoHead community', sub: 'Earn from referrals' },
                  ].map(e => (
                    <div key={e.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: 'rgba(26,40,69,0.55)', border: '1px solid #1A2845' }}>{e.icon}</div>
                      <div>
                        <div className="text-[12px] font-semibold text-slate-300">{e.label}</div>
                        <div className="text-[10px] text-slate-600">{e.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="h-6" />
        </main>
      </div>
    </div>
  )
}

// ─── Earn with Wynko Page ──────────────────────────────────────────────────────

function EarnPage({ onNavigate, profile }: { onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  type EarnTab = "wynkohead" | "invite"
  const [tab, setTab] = useState<EarnTab>("wynkohead")
  const [isWynkoHead, setIsWynkoHead] = useState(false)
  const [inLibrary, setInLibrary] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [regName, setRegName] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [friendCopied, setFriendCopied] = useState(false)
  const [headLinkCopied, setHeadLinkCopied] = useState(false)
  const [subCodeCopied, setSubCodeCopied] = useState(false)
  const [communityMembers, setCommunityMembers] = useState<{ name: string; joined: string }[]>([])
  const [simName, setSimName] = useState("")

  const friendLink = "wynko.in/ref/jatin123"
  const wynkoHeadLink = "wynko.in/wh/jatin-sinsinwar"
  const subHeadCode = "WYNKO-JATIN-HEAD"
  const wynkoins = 150

  function copyFriend() { navigator.clipboard?.writeText(friendLink); setFriendCopied(true); setTimeout(() => setFriendCopied(false), 2000) }
  function copyHeadLink() { navigator.clipboard?.writeText(wynkoHeadLink); setHeadLinkCopied(true); setTimeout(() => setHeadLinkCopied(false), 2000) }
  function copySubCode() { navigator.clipboard?.writeText(subHeadCode); setSubCodeCopied(true); setTimeout(() => setSubCodeCopied(false), 2000) }

  function handleRegister() {
    if (!regName.trim()) return
    setIsWynkoHead(true)
    setRegistering(false)
    setInLibrary(true)
  }

  function addSimMember() {
    const n = simName.trim()
    if (!n) return
    setCommunityMembers(prev => [...prev, { name: n, joined: "Just now" }])
    setSimName("")
  }

  const SHARE_ICONS = [
    { label: "WhatsApp", icon: "💬", color: "#25D366" },
    { label: "Telegram", icon: "✈️", color: "#2AABEE" },
    { label: "Instagram", icon: "📸", color: "#E1306C" },
    { label: "X", icon: "𝕏", color: "#888" },
  ]

  // ── WynkoHead Library (shown after registration) ──
  if (isWynkoHead && inLibrary) {
    const totalEarned = "₹2,840"
    const pending = "₹440"
    const available = "₹2,400"

    const EXAMPLE_MEMBERS = [
      { name: "Rahul Sharma", joined: "3 days ago", purchases: "₹1,200", earn: "₹600" },
      { name: "Priya Meena", joined: "5 days ago", purchases: "₹800", earn: "₹400" },
    ]
    const EXAMPLE_SUB_HEADS = [
      { name: "Aryan Tiwari", code: "WYNKO-ARYAN-HEAD", members: 12, revenue: "₹18,400", myShare: "₹1,840", avatar: "#EC4899", init: "AT" },
      { name: "Komal Singh", code: "WYNKO-KOMAL-HEAD", members: 7, revenue: "₹9,600", myShare: "₹960", avatar: "#7C4DFF", init: "KS" },
    ]

    return (
      <div className="flex h-screen overflow-hidden bg-[#020615]" >
        <Sidebar active="earn" setActive={onNavigate} profile={profile} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
            >
            <button onClick={() => setInLibrary(false)} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
              <Ico n="chevL" cls="w-4 h-4" /> Back
            </button>
            <div className="flex-1">
              <div className="text-[10px] text-slate-600 mb-0.5" >WYNKOHEAD LIBRARY</div>
              <div className="text-sm font-semibold text-slate-200">Your community dashboard</div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.3)]" >
              <span className="text-base">🪙</span>
              <span className="text-sm font-bold text-amber-400" >{wynkoins}</span>
              <span className="text-[10px] text-amber-500">WYNKOINS</span>
            </div>
          <UserAvatar size={32} />
          </header>

          <main className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex gap-5 items-start max-w-5xl">
              {/* Left */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* Share link */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">YOUR WYNKOHEAD INVITE LINK</div>
                  <div className="text-[11px] text-slate-500 mb-3">Share this link — anyone who joins Wynko via this link is added to your community.</div>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3 bg-[#0B1530] border-[#1A2845]" >
                    <span className="text-violet-400">🔗</span>
                    <span className="text-sm text-slate-200 flex-1 font-bold truncate" >{wynkoHeadLink}</span>
                    <button onClick={copyHeadLink} className="text-slate-500 hover:text-violet-400 transition-colors p-1">
                      {headLinkCopied ? <span className="text-[10px] text-emerald-400">✓ Copied</span>
                        : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {SHARE_ICONS.map(s => (
                      <button key={s.label} title={s.label}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all hover:scale-105"
                        style={{ background: `${s.color}18`, border: `1px solid ${s.color}40`, color: s.label === "X" ? "#888" : "#fff" }}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Community */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400">YOUR COMMUNITY</div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border text-[#9B6CFF] bg-[rgba(26,40,69,0.55)] border-[#1E3060]" >{communityMembers.length} members</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-4">Only users who joined Wynko via your link appear here.</div>

                  {communityMembers.length === 0 ? (
                    <div className="py-10 flex flex-col items-center text-center gap-2">
                      <div className="text-4xl">👥</div>
                      <div className="text-sm font-semibold text-slate-400">No members yet</div>
                      <div className="text-[11px] text-slate-600 max-w-xs">Share your WynkoHead invite link above. When someone joins Wynko using that link, they will appear here.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {communityMembers.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-[#0B1530] border-[rgba(26,40,69,0.55)]" >
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7C4DFF,#19B5E6)" }}>
                            {m.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-200">{m.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">Joined {m.joined}</div>
                          </div>
                          <div className="px-2 py-0.5 rounded-full text-[9px] font-bold border text-[#19D3A2] bg-[rgba(25,211,162,0.10)] border-[rgba(25,211,162,0.30)]" >ACTIVE</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dev helper: simulate a user joining */}
                  <div className="mt-4 pt-4 border-t flex gap-2 items-center border-[rgba(26,40,69,0.55)]" >
                    <div className="text-[9px] text-slate-600 flex-shrink-0 font-mono">SIMULATE JOIN (DEMO)</div>
                    <input value={simName} onChange={e => setSimName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSimMember()}
                      placeholder="Enter a name to simulate..."
                      className="flex-1 px-3 py-1.5 rounded-lg border bg-transparent text-[11px] text-slate-300 outline-none placeholder-slate-700 border-[#1A2845]"
                       />
                    <button onClick={addSimMember}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-violet-300 border hover:border-violet-500/50 transition-all border-[#1E3060]"
                      >Add</button>
                  </div>
                </div>

                {/* Sub WynkoHeads */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-400 mb-1">SUB-WYNKOHEADS</div>
                  <div className="text-[11px] text-slate-500 mb-3">Share your WynkoHead code. If another creator registers as WynkoHead using your code, you earn 10% from their community revenue.</div>

                  {/* Share code */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-4 bg-[#0B1530] border-[rgba(25,181,230,0.25)]" >
                    <span className="text-cyan-400">👑</span>
                    <span className="text-sm font-bold text-slate-200 flex-1" >{subHeadCode}</span>
                    <button onClick={copySubCode} className="text-slate-500 hover:text-cyan-400 transition-colors p-1">
                      {subCodeCopied ? <span className="text-[10px] text-emerald-400">✓ Copied</span>
                        : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}
                    </button>
                  </div>

                  <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono" style={{ background: "rgba(245,158,11,0.07)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.2)" }}>
                    ⚠ THE DATA BELOW IS FOR EXAMPLE ONLY — YOUR REAL SUB-WYNKOHEADS WILL APPEAR HERE ONCE THEY REGISTER
                  </div>

                  <div className="space-y-2">
                    {EXAMPLE_SUB_HEADS.map((sh, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-[rgba(25,181,230,0.04)] border-[rgba(25,181,230,0.15)]" >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                          style={{ background: `linear-gradient(135deg,${sh.avatar},${sh.avatar}88)` }}>{sh.init}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-200">{sh.name} <span className="text-[9px] text-amber-500 ml-1">[EXAMPLE]</span></div>
                          <div className="text-[10px] text-slate-500 font-mono">{sh.members} students · {sh.code}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">Revenue: <span className="text-slate-200 font-semibold">{sh.revenue}</span></div>
                          <div className="text-[11px] text-cyan-400 font-bold">Your 10%: {sh.myShare}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Community revenue detail */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">REVENUE BREAKDOWN — EXAMPLE</div>
                  <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono" style={{ background: "rgba(245,158,11,0.07)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.2)" }}>
                    ⚠ THESE ARE EXAMPLE EARNINGS — YOUR ACTUAL NUMBERS WILL APPEAR AS YOUR COMMUNITY GROWS
                  </div>
                  <div className="flex gap-3 mb-3">
                    {[
                      { icon: "👥", label: "Community purchases", price: "₹1,200", earn: "₹600", note: "50% share" },
                      { icon: "🔗", label: "Sub-WynkoHead revenue", price: "₹28,000", earn: "₹2,800", note: "10% share" },
                      { icon: "📚", label: "Study Pack purchase", price: "₹500", earn: "₹250", note: "50% share" },
                    ].map(ex => (
                      <div key={ex.label} className="flex-1 p-3.5 rounded-xl border bg-[rgba(124,77,255,0.08)] border-[rgba(26,40,69,0.55)]" >
                        <div className="text-xl mb-2">{ex.icon}</div>
                        <div className="text-[11px] font-bold text-slate-300 mb-0.5">{ex.label}</div>
                        <div className="text-[10px] text-slate-500">{ex.price} · {ex.note}</div>
                        <div className="mt-2 pt-2 border-t text-[11px] border-[rgba(26,40,69,0.55)]" >
                          You earn: <span className="font-bold text-[#19D3A2]" >{ex.earn}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right sidebar — earnings */}
              <div className="w-68 flex-shrink-0 space-y-4" style={{ width: "268px" }}>
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]" >
                  <div className="flex items-center gap-2 mb-4">
                    <span>👑</span>
                    <span className="text-sm font-bold text-white">Your Earnings</span>
                    <span className="text-[9px] text-amber-500 ml-1">[EXAMPLE]</span>
                  </div>
                  <div className="text-4xl font-black text-white mb-1" >{totalEarned}</div>
                  <div className="text-[10px] text-amber-500 mb-3 font-mono">EXAMPLE — grows as your community grows</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.2)]" >
                      <div className="flex items-center gap-2"><span>⏱️</span><span className="text-[11px] text-slate-400">Pending confirmation</span></div>
                      <span className="text-sm font-bold text-amber-400">{pending}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border bg-[rgba(25,211,162,0.06)] border-[rgba(25,211,162,0.20)]" >
                      <div className="flex items-center gap-2"><span>💳</span><span className="text-[11px] text-slate-400">Available to withdraw</span></div>
                      <span className="text-sm font-bold text-emerald-400">{available}</span>
                    </div>
                  </div>
                  <button className="w-full mt-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#7C4DFF,#6B44EE)", boxShadow: "0 0 16px #1E3060" }}>
                    Withdraw Earnings
                  </button>
                </div>

                {/* WYNKOINS */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[rgba(245,158,11,0.3)]" >
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">🪙</span><span className="text-sm font-bold text-white">WYNKOINS</span></div>
                  <div className="text-4xl font-black text-amber-400 mb-1" >{wynkoins}</div>
                  <div className="text-[11px] text-slate-500 mb-3">Earned from friend invites</div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { label: "Friend streak bonus", coins: "+50 (EXAMPLE)", color: "#19D3A2" },
                      { label: "Welcome bonus", coins: "+100 (REAL)", color: "#9B6CFF" },
                    ].map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-[rgba(245,158,11,0.1)]" >
                        <span className="text-slate-400">{e.label}</span>
                        <span className="font-bold" style={{ color: e.color }}>{e.coins}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-4 py-2 rounded-xl text-amber-400 text-[12px] font-semibold border transition-all hover:bg-amber-500/10 border-[rgba(245,158,11,0.3)]"
                    >Redeem WYNKOINS</button>
                </div>

                <div className="rounded-2xl border p-4 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">COMMUNITY STATS</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Members", val: String(communityMembers.length), color: "#C4AAFF" },
                      { label: "Sub-WynkoHeads", val: "0", color: "#7DD8F0" },
                    ].map(s => (
                      <div key={s.label} className="p-3 rounded-xl border text-center border-[rgba(26,40,69,0.55)] bg-[#0B1530]" >
                        <div className="text-xl font-black" style={{ color: s.color }}>{s.val}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }

  // ── Main Earn Page ──
  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]" >
      <Sidebar active="earn" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]"
          >
          <button onClick={() => onNavigate("home")} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" >EARN WITH WYNKO</div>
            <div className="text-sm font-semibold text-slate-200">Build your community. Share the revenue.</div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.3)]" >
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-amber-400" >{wynkoins}</span>
            <span className="text-[10px] text-amber-500">WYNKOINS</span>
          </div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* Hero — no revenue split visual */}
          <div className="relative overflow-hidden px-8 py-8" style={{ background: "linear-gradient(130deg,#080B1A 0%,#12083A 55%,#080B1A 100%)", borderBottom: "1px solid #1A2845" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 60% 50%,#1A2845,transparent 65%)" }} />
            <div className="relative z-10">
              <div className="text-[10px] font-mono tracking-[0.28em] text-violet-400 mb-3">EARN WITH WYNKO</div>
              <h1 className="text-3xl font-black text-white leading-tight mb-1">Become a <span style={{ background: "linear-gradient(135deg,#7C4DFF,#19B5E6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>WynkoHead.</span></h1>
              <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-5">Build your own community of students on Wynko. Earn 50% revenue share on every purchase your students make. Grow your network — earn from your network's WynkoHeads too. Or simply invite friends and earn WYNKOINS together.</p>
              <div className="flex gap-6 flex-wrap">
                {[
                  { icon: "👑", v: "50%", label: "Revenue from your community" },
                  { icon: "🔗", v: "10%", label: "From Sub-WynkoHead revenue" },
                  { icon: "🪙", v: "WYNKOINS", label: "For every friend who hits 3-day streak" },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: "rgba(26,40,69,0.55)", border: "1px solid #1E3060" }}>{f.icon === "🪙" ? <img src="/wynkoin.png" alt="Wynkoin" className="w-6 h-6 object-contain" /> : f.icon}</div>
                    <div>
                      <div className="text-base font-black" style={{ background: "linear-gradient(135deg,#C4AAFF,#7DD8F0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{f.v}</div>
                      <div className="text-[10px] text-slate-500">{f.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 px-6 py-3 border-b border-[rgba(26,40,69,0.55)]" >
            {([
              { id: "wynkohead" as EarnTab, icon: "👑", label: "WynkoHead Program" },
              { id: "invite" as EarnTab, icon: "🎁", label: "Invite a Friend" },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: tab === t.id ? "rgba(26,40,69,0.55)" : "transparent",
                  color: tab === t.id ? "#C4AAFF" : "#4E5E84",
                  border: "1px solid " + (tab === t.id ? "#1E3060" : "transparent"),
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="px-6 py-5 max-w-4xl">

            {/* ── WYNKOHEAD TAB ── */}
            {tab === "wynkohead" && (
              <div className="space-y-4">
                {/* How it works */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-4">HOW WYNKOHEAD WORKS</div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { n: "1", icon: "📣", title: "Invite Students", desc: "Share your WynkoHead link. Students who join Wynko via your link become part of your community." },
                      { n: "2", icon: "🛒", title: "They Purchase", desc: "Any time a community student buys a plan, pack, or merch — you automatically get 50% of the revenue." },
                      { n: "3", icon: "🔗", title: "Grow Sub-WynkoHeads", desc: "Share your WynkoHead code to other creators. When they register using it, you earn 10% from their community revenue too." },
                    ].map(s => (
                      <div key={s.n} className="p-4 rounded-xl border bg-[rgba(124,77,255,0.08)] border-[rgba(26,40,69,0.55)]" >
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7C4DFF,#6B44EE)" }}>{s.n}</div>
                          <span className="text-xl">{s.icon}</span>
                        </div>
                        <div className="text-sm font-bold text-white mb-1.5">{s.title}</div>
                        <div className="text-[11px] text-slate-400 leading-relaxed">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Register / Open Library CTA */}
                {!isWynkoHead ? (
                  <div className="rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1E3060]" >
                    {!registering ? (
                      <div className="p-6 flex items-center justify-between gap-6">
                        <div>
                          <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">READY TO START?</div>
                          <div className="text-lg font-black text-white mb-1">Register as a WynkoHead</div>
                          <div className="text-[12px] text-slate-400">Unlock your community dashboard, share your invite link, and start earning 50% revenue share.</div>
                        </div>
                        <button onClick={() => setRegistering(true)}
                          className="flex-shrink-0 px-6 py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.03]"
                          style={{ background: "linear-gradient(135deg,#7C4DFF,#6B44EE)", boxShadow: "0 0 28px #2855CC" }}>
                          👑 Register as WynkoHead
                        </button>
                      </div>
                    ) : (
                      <div className="p-6">
                        <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-4">WYNKOHEAD REGISTRATION</div>
                        <div className="space-y-3 max-w-md">
                          <div>
                            <div className="text-[10px] text-slate-500 mb-1.5">FULL NAME *</div>
                            <input value={regName} onChange={e => setRegName(e.target.value)}
                              placeholder="Your full name"
                              className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1E3060]"
                               />
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-1.5">PHONE / SOCIAL HANDLE (optional)</div>
                            <input value={regPhone} onChange={e => setRegPhone(e.target.value)}
                              placeholder="+91 or @handle"
                              className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1E3060]"
                               />
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button onClick={() => setRegistering(false)}
                              className="px-4 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]"
                              >Cancel</button>
                            <button onClick={handleRegister}
                              className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
                              style={{ background: regName.trim() ? "linear-gradient(135deg,#7C4DFF,#6B44EE)" : "#0B1530", opacity: regName.trim() ? 1 : 0.5 }}>
                              Complete Registration →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => setInLibrary(true)}
                    className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border transition-all hover:scale-[1.01]"
                    style={{ background: "linear-gradient(135deg,rgba(26,40,69,0.55),rgba(79,70,229,0.12))", borderColor: "#2855CC", boxShadow: "0 0 32px rgba(124,77,255,0.25)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#1A2845", border: "1px solid #4A3A88" }}>👑</div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-white">Open WynkoHead Library</div>
                        <div className="text-[11px] text-slate-400">{communityMembers.length} community members · your dashboard</div>
                      </div>
                    </div>
                    <Ico n="chevR" cls="w-5 h-5 text-violet-400" />
                  </button>
                )}
              </div>
            )}

            {/* ── INVITE FRIEND TAB ── */}
            {tab === "invite" && (
              <div className="space-y-4">
                {/* How it works */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-4">HOW FRIEND INVITES WORK</div>
                  <div className="flex gap-4">
                    {[
                      { icon: "🔗", title: "Share Your Link", desc: "Copy your unique invite link and send it to a friend." },
                      { icon: "🎓", title: "Friend Joins", desc: "Your friend signs up on Wynko using your link." },
                      { icon: "🔥", title: "3-Day Streak", desc: "They study for 3 consecutive days on Wynko." },
                      { icon: "🪙", title: "Both Get WYNKOINS", desc: "You and your friend each receive WYNKOINS instantly!" },
                    ].map((s, i) => (
                      <div key={i} className="flex-1 p-3.5 rounded-xl border text-center bg-[rgba(124,77,255,0.08)] border-[rgba(26,40,69,0.55)]" >
                        <div className="text-2xl mb-2 flex justify-center">{s.icon === "🪙" ? <img src="/wynkoin.png" alt="Wynkoin" className="w-7 h-7 object-contain" /> : s.icon}</div>
                        <div className="text-[12px] font-bold text-white mb-1">{s.title}</div>
                        <div className="text-[10px] text-slate-400 leading-relaxed">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-4 p-4 rounded-xl border bg-[rgba(245,158,11,0.06)] border-[rgba(245,158,11,0.25)]" >
                    <span className="text-3xl">🪙</span>
                    <div>
                      <div className="text-sm font-bold text-amber-300">WYNKOINS Reward</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">After your friend completes their 3-day streak — <span className="text-amber-400 font-bold">you get 50 WYNKOINS</span> and <span className="text-amber-400 font-bold">they get 50 WYNKOINS</span> too.</div>
                    </div>
                  </div>
                </div>

                {/* Referral link */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1E3060]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">YOUR INVITE LINK</div>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3 bg-[#0B1530] border-[#1A2845]" >
                    <span className="text-violet-400">🔗</span>
                    <span className="text-sm text-slate-200 flex-1 font-bold" >{friendLink}</span>
                    <button onClick={copyFriend} className="text-slate-500 hover:text-violet-400 transition-colors p-1">
                      {friendCopied ? <span className="text-[10px] text-emerald-400">✓ Copied!</span>
                        : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}
                    </button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    {SHARE_ICONS.map(s => (
                      <button key={s.label} title={s.label}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all hover:scale-105"
                        style={{ background: s.color + "18", border: "1px solid " + s.color + "40", color: s.label === "X" ? "#888" : "#fff" }}>
                        {s.icon} {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Friend tracking — clearly labeled */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400">FRIENDS YOU INVITED</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-3">Only friends who joined Wynko via your link appear here. Real users only — no examples.</div>
                  <div className="py-10 flex flex-col items-center text-center gap-2">
                    <div className="text-4xl">🎁</div>
                    <div className="text-sm font-semibold text-slate-400">No invites yet</div>
                    <div className="text-[11px] text-slate-600 max-w-xs">Share your invite link above. When a friend joins Wynko and completes a 3-day streak, you both get WYNKOINS.</div>
                  </div>
                </div>

                {/* WYNKOINS balance */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[rgba(245,158,11,0.3)]" >
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">🪙</span><span className="text-sm font-bold text-white">Your WYNKOINS</span></div>
                  <div className="text-4xl font-black text-amber-400 mb-1" >{wynkoins}</div>
                  <div className="text-[11px] text-slate-500 mb-3">Earned from friend invites and bonuses</div>
                  <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono" style={{ background: "rgba(245,158,11,0.07)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.2)" }}>
                    ⚠ BREAKDOWN BELOW IS FOR EXAMPLE — YOUR REAL HISTORY WILL APPEAR AS YOU INVITE FRIENDS
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { label: "Friend streak bonus (EXAMPLE)", coins: "+50", color: "#19D3A2" },
                      { label: "Welcome bonus (REAL)", coins: "+100", color: "#9B6CFF" },
                    ].map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-[rgba(245,158,11,0.1)]" >
                        <span className="text-slate-400">{e.label}</span>
                        <span className="font-bold" style={{ color: e.color }}>{e.coins}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-4 py-2 rounded-xl text-amber-400 text-[12px] font-semibold border transition-all hover:bg-amber-500/10 border-[rgba(245,158,11,0.3)]"
                    >Redeem WYNKOINS</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── 3D Library Page ───────────────────────────────────────────────────────────
// ─── 3D Library Page ───────────────────────────────────────────────────────────

function LibraryPage({ onNavigate, profile }: { onNavigate: (id: string) => void; profile?: ProfileInfo }) {
  return (
    <div className="flex h-screen overflow-hidden" >
      <Sidebar active="3dlibrary" setActive={onNavigate} profile={profile} />
      {/* Full-screen image fill */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={libraryBg}
          alt="3D Library virtual study space"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Translucent overlay */}
        <div className="absolute inset-0" style={{ background: 'rgba(6,8,15,0.62)', backdropFilter: 'blur(1px)' }} />
        {/* Coming Soon CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl mb-2"
            style={{ background: '#1A2845', border: '1.5px solid #4A3A88', boxShadow: '0 0 48px #1E3060', backdropFilter: 'blur(8px)' }}>
            🏛️
          </div>
          {/* Label */}
          <div className="text-[11px] font-mono tracking-[0.3em] text-violet-400">3D LIBRARY</div>
          {/* Heading */}
          <h1 className="text-6xl font-black text-white leading-tight"
            style={{ textShadow: '0 0 60px #563FA0, 0 0 120px #2855CC', letterSpacing: '-0.02em' }}>
            Coming Soon
          </h1>
          {/* Sub */}
          <p className="text-lg text-slate-300 max-w-md leading-relaxed" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
            Your immersive 3D virtual study library is being crafted. Study, explore, and level up in a whole new dimension.
          </p>
          {/* Pill badges */}
          <div className="flex gap-3 flex-wrap justify-center mt-2">
            {['Virtual Study Rooms', 'Solo Pods', 'Discussion Corner', 'Resource Hub'].map(f => (
              <div key={f} className="px-4 py-1.5 rounded-full text-sm font-medium border"
                style={{ background: 'rgba(26,40,69,0.55)', borderColor: '#2855CC', color: '#C4AAFF', backdropFilter: 'blur(8px)' }}>
                {f}
              </div>
            ))}
          </div>
          {/* Notify button */}
          <button className="mt-2 flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-white text-base transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#7C4DFF', boxShadow: '0 0 32px #4A3A88', backdropFilter: 'blur(8px)' }}>
            <Ico n="bell" cls="w-5 h-5" />
            Notify Me When It's Live
          </button>
          {/* Back */}
          <button onClick={() => onNavigate('home')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mt-1">
            <Ico n="chevL" cls="w-4 h-4" /> Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function DesktopDashboard() {
  const [activeNav, setActiveNav] = useState('home')
  const [sharedUnits, setSharedUnits] = useState<StudyUnit[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[][]>(Array.from({ length: 7 }, () => []))
  const [activeRoom, setActiveRoom] = useState<RoomData | null>(null)
  const [userAvatar, setUserAvatar] = useState<string>(avatar7)
  const [avatarTouched, setAvatarTouched] = useState(false)

  // Home's real data — everything else on this page (Focus Lock,
  // Schedules, Study Rooms, Battleground, Settings, Wynkoins, Earn,
  // Library) still runs on the local mock state above until their
  // own module pass.
  const { authState, reviewItems, recallCurves, profile, todayFocus, loading: homeLoading, addUnit, removeUnitBySubject, markAsReviewed } = useHomeData()

  // A real uploaded photo wins over the 6 illustrated presets, same
  // "resync until touched" pattern as Settings' displayName field -
  // once someone picks a preset in Settings this session, that choice
  // sticks even if profile re-fetches.
  useEffect(() => {
    if (!avatarTouched && profile?.avatarUrl) setUserAvatar(profile.avatarUrl)
  }, [profile?.avatarUrl, avatarTouched])

  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  function handleNav(id: string) {
    setActiveNav(id)
    if (id !== 'studyrooms') setActiveRoom(null)
  }
  function goFocus() { setActiveNav('focus') }

  function handleAddUnit(u: StudyUnit) {
    addUnit(u.subject, u.topics)
  }

  function handleRemoveUnit(subject: string) {
    removeUnitBySubject(subject)
  }

  function setUserAvatarTouched(a: string) { setAvatarTouched(true); setUserAvatar(a) }

  function renderPage() {
    if (activeNav === 'focus') {
      return <FocusLockPage units={sharedUnits} schedule={schedule} todayIdx={todayIdx} onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'schedules') {
      return <SchedulesPage onNavigate={handleNav} schedule={schedule} setSchedule={setSchedule} sharedUnits={sharedUnits} setSharedUnits={setSharedUnits} profile={profile} />
    }
    if (activeNav === 'battleground') {
      return <BattlegroundPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === '3dlibrary') {
      return <LibraryPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'wynkoins') {
      return <WynkoinsPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'earn') {
      return <EarnPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'settings') {
      return <SettingsPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'studyrooms') {
      if (activeRoom) {
        return <RoomInteriorPage room={activeRoom} onBack={() => setActiveRoom(null)} onNavigate={handleNav} profile={profile} />
      }
      return <StudyRoomsPage onNavigate={handleNav} onEnterRoom={room => setActiveRoom(room)} profile={profile} />
    }

    // ── Home (the module wired to real data this pass) ──
    if (authState === 'loading' || (authState === 'ready' && homeLoading)) {
      return (
        <div className="flex h-screen items-center justify-center text-slate-500 text-sm" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
          Loading your dashboard…
        </div>
      )
    }
    if (authState === 'signed-out') {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center px-6" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
          <div className="text-slate-200 text-base font-semibold">Sign in to see your dashboard</div>
          <div className="text-slate-500 text-sm max-w-xs">Your review queue and study data will show up here once you're signed in.</div>
          <a href="/login.html" className="mt-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#8b5cf6', color: '#fff' }}>Go to sign in</a>
        </div>
      )
    }

    const atRisk = reviewItems.filter(i => i.urgency === 'high').length
    const due = reviewItems.filter(i => i.urgency !== 'low').length
    const stable = reviewItems.filter(i => i.urgency === 'low').length

    // Today's already-logged entries, shown as removable chips in
    // QuickAddUnit — derived from real reviewItems (daysAgo === 0)
    // rather than tracked as separate local state.
    const todaysUnits: StudyUnit[] = reviewItems
      .filter(i => i.daysAgo === 0)
      .map(i => ({ subject: i.subject, exam: '', topics: [i.topic] }))

    return (
      <div className="flex h-screen overflow-hidden text-slate-200" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
        <Sidebar active={activeNav} setActive={handleNav} profile={profile} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header profile={profile} />
          <main className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
            <TodayHero onGoFocus={goFocus} atRisk={atRisk} due={due} stable={stable} curveData={recallCurves} />
            <QuickActions onGoFocus={goFocus} onNavigate={handleNav} />
            <QuickAddUnit added={todaysUnits} onAdd={handleAddUnit} onRemove={handleRemoveUnit} />
            <div className="grid gap-3.5" style={{ gridTemplateColumns: '3fr 2fr' }}>
              <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <ReviewQueue items={reviewItems} onDismiss={markAsReviewed} />
              </div>
              <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <FocusPanel onGoFocus={goFocus} todayFocus={todayFocus} />
              </div>
            </div>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: '3fr 2fr' }}>
              <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <StudyRooms onNavigate={handleNav} />
              </div>
              <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <LibraryPreview onNavigate={handleNav} />
              </div>
            </div>
            <div className="h-4" />
          </main>
        </div>
      </div>
    )
  }

  return (
    <UserAvatarCtx.Provider value={{ avatar: userAvatar, setAvatar: setUserAvatarTouched }}>
      {renderPage()}
    </UserAvatarCtx.Provider>
  )
}


