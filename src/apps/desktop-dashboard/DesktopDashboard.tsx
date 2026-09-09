import { useState, useRef, useEffect } from 'react'
import libraryBg from './imports/Screenshot_2026_0908_032315.png'
import { useHomeData } from './lib/useHomeData'
import type { ReviewItem } from '../_shared/wynkoTracker'

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

function Ico({ n, cls = 'w-4 h-4' }: { n: keyof typeof IP; cls?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cls}>
      {IP[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudyUnit { subject: string; exam: string; topics: string[] }

// ─── Recall Curve SVG ─────────────────────────────────────────────────────────
function RecallCurve() {
  const solid = 'M 0,0 C 8,21 17,48 25,63 C 34,78 43,92 51,90 C 60,89 63,57 76,54 C 89,51 110,73 127,72 C 144,71 156,48 177,47 C 198,46 224,66 253,65 C 283,64 316,41 354,40 C 392,39 456,54 481,58 C 507,62 503,64 507,65'
  const projected = 'M 507,65 C 530,67 580,84 607,86 C 650,90 720,108 760,112'
  const area = solid + ' L 507,180 L 0,180 Z'
  const reviewPts = [{ x: 76, y: 54, label: 'R1' }, { x: 177, y: 47, label: 'R2' }, { x: 354, y: 40, label: 'R3' }]
  return (
    <svg viewBox="0 0 760 200" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rcLine" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#22D3EE" /></linearGradient>
        <linearGradient id="rcArea" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#7C3AED" stopOpacity="0.22" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0" /></linearGradient>
        <filter id="rcGlow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id="dotGlow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {[0, 25, 50, 75, 100].map(pct => { const y = (1 - pct / 100) * 180; return (<g key={pct}><line x1="0" y1={y} x2="760" y2={y} stroke="rgba(99,102,241,0.07)" strokeWidth="1" /><text x="6" y={y - 3} fontSize="8" fill="rgba(148,163,184,0.4)" fontFamily="JetBrains Mono, monospace">{pct}%</text></g>) })}
      {[0, 5, 10, 15, 20, 25, 30].map(day => { const x = day * 760 / 30; return (<g key={day}><line x1={x} y1="0" x2={x} y2="182" stroke="rgba(99,102,241,0.06)" strokeWidth="1" /><text x={x} y="196" fontSize="8" fill="rgba(148,163,184,0.35)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">d{day}</text></g>) })}
      <path d={area} fill="url(#rcArea)" />
      <path d={solid} fill="none" stroke="url(#rcLine)" strokeWidth="2.5" filter="url(#rcGlow)" />
      <path d={projected} fill="none" stroke="#F59E0B" strokeWidth="1.75" strokeDasharray="5,4" opacity="0.7" />
      {reviewPts.map(({ x, y, label }) => (<g key={label}><circle cx={x} cy={y} r="4" fill="#22D3EE" opacity="0.85" filter="url(#dotGlow)" /><text x={x} y={y - 9} fontSize="7.5" fill="rgba(34,211,238,0.65)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">{label}</text></g>))}
      <line x1="507" y1="0" x2="507" y2="182" stroke="rgba(34,211,238,0.18)" strokeWidth="1" strokeDasharray="3,3" />
      <text x="513" y="11" fontSize="8" fill="rgba(34,211,238,0.7)" fontFamily="JetBrains Mono, monospace">TODAY</text>
      <circle cx="507" cy="65" r="8" fill="#22D3EE" opacity="0.12" filter="url(#dotGlow)" />
      <circle cx="507" cy="65" r="4.5" fill="#22D3EE" filter="url(#dotGlow)" />
      <circle cx="507" cy="65" r="2" fill="white" />
      <text x="500" y="57" fontSize="9" fill="rgba(34,211,238,0.9)" fontFamily="JetBrains Mono, monospace" textAnchor="end" fontWeight="500">64%</text>
      <text x="640" y="76" fontSize="8" fill="rgba(245,158,11,0.65)" fontFamily="JetBrains Mono, monospace">projected decay</text>
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
function TimerCircle({ remaining, total, timeStr, running, size = 340 }: {
  remaining: number; total: number; timeStr: string; running: boolean; size?: number
}) {
  const R = Math.round(size * 0.385)
  const CX = size / 2, CY = size / 2
  const circ = 2 * Math.PI * R
  const progress = total > 0 ? 1 - remaining / total : 0
  const arcLen = progress * circ
  const tipAngle = -Math.PI / 2 + progress * 2 * Math.PI
  const tipX = CX + R * Math.cos(tipAngle)
  const tipY = CY + R * Math.sin(tipAngle)
  const sw = Math.round(size * 0.042)
  const gid = `g${size}`
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <defs>
        <radialGradient id={`ig${gid}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor="#130E2A" />
          <stop offset="100%" stopColor="#070915" />
        </radialGradient>
        <linearGradient id={`rg${gid}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="45%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
        <filter id={`rf${gid}`} x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.018} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`df${gid}`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={size * 0.014} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Outer ambient halo */}
      <circle cx={CX} cy={CY} r={R + sw + 6} fill="none" stroke="rgba(124,58,237,0.07)" strokeWidth={sw * 2.2} />
      {/* Track */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={sw} />
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
      {/* Tip glow dot */}
      {progress > 0.008 && (
        <>
          <circle cx={tipX} cy={tipY} r={sw * 1.1} fill="#60A5FA" opacity="0.22" filter={`url(#df${gid})`} />
          <circle cx={tipX} cy={tipY} r={sw * 0.62} fill="#60A5FA" filter={`url(#df${gid})`} />
          <circle cx={tipX} cy={tipY} r={sw * 0.25} fill="white" />
        </>
      )}
      {/* Plant icon */}
      <text x={CX} y={CY - size * 0.125} textAnchor="middle" fontSize={size * 0.07}>🌱</text>
      {/* FOCUS TIME label */}
      <text x={CX} y={CY - size * 0.038} textAnchor="middle"
        fontSize={size * 0.029} fill="rgba(148,163,184,0.6)"
        fontFamily="Poppins, sans-serif" fontWeight="600" letterSpacing={size * 0.009}>
        FOCUS TIME
      </text>
      {/* Time display */}
      <text x={CX} y={CY + size * 0.095} textAnchor="middle"
        fontSize={size < 400 ? (timeStr.length > 5 ? 34 : 44) : (timeStr.length > 5 ? 52 : 66)}
        fill="#F1F5F9" fontFamily="JetBrains Mono, monospace" fontWeight="700">
        {timeStr}
      </text>
      {/* Live dot */}
      {running && (
        <circle cx={CX + size * 0.09} cy={CY + size * 0.123} r={size * 0.008} fill="#22D3EE" opacity="0.9" />
      )}
    </svg>
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
function Sidebar({ active, setActive }: { active: string; setActive: (id: string) => void }) {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r h-full"
      style={{ background: '#090B18', borderColor: 'rgba(124,58,237,0.18)' }}>
      <div className="flex items-center gap-3 px-5 py-[18px] border-b" style={{ borderColor: 'rgba(124,58,237,0.14)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center relative flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #22D3EE 100%)' }}>
          <span className="text-white font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>W</span>
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2" style={{ borderColor: '#090B18' }} />
        </div>
        <div>
          <div className="text-white font-semibold text-base leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>Wynko</div>
          <div className="text-[10px] text-emerald-400 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>● online</div>
        </div>
      </div>
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {['HOME', 'STUDY', 'OTHER'].map(group => (
          <div key={group} className="mb-5">
            <div className="text-[9px] font-semibold text-slate-600 tracking-[0.15em] px-2 mb-1.5" style={{ fontFamily: 'Poppins, sans-serif' }}>{group}</div>
            {NAV.filter(n => n.group === group).map(item => {
              const isActive = active === item.id
              return (
                <button key={item.id} onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5 group relative ${isActive ? 'text-violet-300' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}
                  style={{ fontFamily: 'Poppins, sans-serif', background: isActive ? 'rgba(124,58,237,0.1)' : undefined }}>
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-violet-400 rounded-r-full" style={{ boxShadow: '0 0 8px rgba(167,139,250,0.6)' }} />}
                  <Ico n={item.icon} cls={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-600 group-hover:text-slate-400'}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="border-t p-4" style={{ borderColor: 'rgba(124,58,237,0.14)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>JS</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-200 font-medium truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>Jatin Sinsinwar</div>
            <div className="text-[10px] text-slate-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>JEE 2026</div>
          </div>
          <button className="text-slate-600 hover:text-slate-300 transition-colors"><Ico n="cog" cls="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </aside>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 backdrop-blur-sm"
      style={{ background: 'rgba(8,10,18,0.9)', borderColor: 'rgba(124,58,237,0.15)' }}>
      <div className="flex-1">
        <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Home / Today</div>
        <div className="text-sm font-semibold text-slate-200" style={{ fontFamily: 'Poppins, sans-serif' }}>Mon, 1 Sep 2026</div>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 text-sm w-52 border"
        style={{ background: 'rgba(14,21,40,0.8)', borderColor: 'rgba(124,58,237,0.2)' }}>
        <Ico n="search" cls="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs text-slate-500 flex-1" style={{ fontFamily: 'Poppins, sans-serif' }}>Search topics...</span>
        <kbd className="text-[10px] rounded px-1 text-slate-600 font-mono border" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.08)' }}>⌘K</kbd>
      </div>
      <button className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors">
        <Ico n="bell" cls="w-5 h-5" />
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" style={{ boxShadow: '0 0 6px rgba(139,92,246,0.8)' }} />
      </button>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>JS</div>
    </header>
  )
}

// ─── Today Hero ───────────────────────────────────────────────────────────────
function TodayHero({ onGoFocus, atRisk, due, stable, topSubject }: { onGoFocus: () => void; atRisk: number; due: number; stable: number; topSubject: string }) {
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()
  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border"
      style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.25)', boxShadow: '0 0 60px rgba(124,58,237,0.07), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)', transform: 'translate(25%,-30%)' }} />
      <div className="absolute bottom-0 left-1/3 w-56 h-56 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)', transform: 'translate(-50%,40%)' }} />
      <div className="relative flex gap-6 items-stretch">
        <div className="flex-shrink-0 w-44 flex flex-col justify-between">
          <div>
            <div className="text-[9px] font-mono text-violet-400 tracking-[0.2em] mb-2">TODAY · {dateLabel}</div>
            <div className="text-[22px] font-bold text-slate-100 leading-tight mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>Memory<br />at Risk</div>
            <div className="text-xs text-slate-400 mb-4 leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {atRisk > 0 ? `${atRisk} topic${atRisk > 1 ? 's' : ''} below critical retention threshold` : 'All topics above critical threshold'}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ background: 'rgba(248,113,113,0.07)', borderColor: 'rgba(248,113,113,0.2)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-red-300" style={{ fontFamily: 'Poppins, sans-serif' }}>{atRisk} topic{atRisk !== 1 ? 's' : ''} at risk</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.22)' }}>
              <Ico n="wave" cls="w-3 h-3 text-violet-400 flex-shrink-0" />
              <span className="text-[11px] text-violet-300" style={{ fontFamily: 'Poppins, sans-serif' }}>{due} review{due !== 1 ? 's' : ''} due</span>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border" style={{ background: 'rgba(52,211,153,0.07)', borderColor: 'rgba(52,211,153,0.2)' }}>
              <Ico n="check" cls="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-300" style={{ fontFamily: 'Poppins, sans-serif' }}>{stable} stable</span>
            </div>
            <button onClick={onGoFocus} className="mt-3 w-full py-2 rounded-lg text-[11px] font-semibold text-white flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', fontFamily: 'Poppins, sans-serif', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
              <Ico n="play" cls="w-3 h-3" />Start Review
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[9px] font-mono text-slate-500 tracking-wide uppercase">
              RECALL CURVE{topSubject ? ` — ${topSubject}` : ''}
            </div>
            <div className="flex items-center gap-3 text-[9px] font-mono text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-4 h-[2px] rounded" style={{ background: 'linear-gradient(90deg,#7C3AED,#22D3EE)' }} />actual</div>
              <div className="flex items-center gap-1.5"><div className="w-4 border-t border-amber-400 border-dashed" />projected</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-cyan-400 opacity-80" />review</div>
            </div>
          </div>
          <div className="flex-1" style={{ minHeight: '170px' }}><RecallCurve /></div>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Actions ────────────────────────────────────────────────────────────
function QuickActions({ onGoFocus, onNavigate }: { onGoFocus: () => void; onNavigate: (id: string) => void }) {
  const actions = [
    { label: 'Start Focus', sub: 'Focus Lock', icon: 'lock' as const, grad: 'linear-gradient(135deg,#7C3AED,#5B21B6)', glow: 'rgba(124,58,237,0.35)', onClick: onGoFocus },
    { label: 'Schedules', sub: 'Plan sessions', icon: 'clock' as const, grad: 'linear-gradient(135deg,#0891B2,#0E7490)', glow: 'rgba(8,145,178,0.3)', onClick: () => onNavigate('schedules') },
    { label: 'Study Room', sub: '24 online', icon: 'rooms' as const, grad: 'linear-gradient(135deg,#047857,#065F46)', glow: 'rgba(4,120,87,0.3)', onClick: () => onNavigate('studyrooms') },
    { label: '3D Library', sub: 'Virtual Space', icon: 'cube' as const, grad: 'linear-gradient(135deg,#4338CA,#3730A3)', glow: 'rgba(67,56,202,0.3)', onClick: () => onNavigate('3dlibrary') },
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {actions.map((a, i) => (
        <button key={i} onClick={a.onClick}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
          style={{ background: a.grad, boxShadow: `0 4px 24px ${a.glow}` }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <Ico n={a.icon} cls="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-white leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>{a.label}</div>
            <div className="text-[10px] text-white/55 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{a.sub}</div>
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
      background: '#0A0D1E',
      borderColor: flash ? 'rgba(34,211,238,0.5)' : 'rgba(124,58,237,0.22)',
      boxShadow: flash ? '0 0 30px rgba(34,211,238,0.1)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      transition: 'border-color 0.4s, box-shadow 0.4s',
    }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-slate-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>NEW STUDY UNIT: QUICK ADD</div>
        {added.length > 0 && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ color: '#34D399', background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.25)' }}>
            {added.length} unit{added.length > 1 ? 's' : ''} added
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Subject */}
        <div ref={subjectRef} className="relative">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-text min-w-[180px] transition-colors"
            style={{ background: 'rgba(14,21,40,0.7)', borderColor: subjectOpen ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.22)' }}
            onClick={() => setSubjectOpen(true)}>
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0 text-violet-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 2h10M3 14h10M4 2v3l4 3-4 3v2M12 2v3L8 8l4 3v2" />
            </svg>
            <input className="bg-transparent outline-none text-sm text-slate-200 w-full placeholder-slate-600 min-w-[100px]"
              style={{ fontFamily: 'Poppins, sans-serif' }} placeholder="Subject"
              value={subject} onChange={e => { setSubject(e.target.value); setSubjectOpen(true) }} onFocus={() => setSubjectOpen(true)} />
            {exam && (<><span className="text-slate-600 text-xs flex-shrink-0">›</span><span className="text-xs text-cyan-400 flex-shrink-0 truncate max-w-[80px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{exam}</span></>)}
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
          </div>
          {subjectOpen && filteredSubjects.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 rounded-xl border overflow-hidden w-full min-w-[200px]"
              style={{ background: '#0D1428', borderColor: 'rgba(124,58,237,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {filteredSubjects.map(s => (
                <button key={s} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-violet-500/10 hover:text-violet-200 transition-colors"
                  style={{ fontFamily: 'Poppins, sans-serif' }} onMouseDown={e => { e.preventDefault(); setSubject(s); setSubjectOpen(false) }}>{s}</button>
              ))}
              {subject && !SUBJECT_SUGGESTIONS.map(s => s.toLowerCase()).includes(subject.toLowerCase()) && (
                <button className="w-full text-left px-3 py-2 text-sm border-t flex items-center gap-2 transition-colors"
                  style={{ color: '#A78BFA', borderColor: 'rgba(124,58,237,0.2)', fontFamily: 'Poppins, sans-serif' }}
                  onMouseDown={e => { e.preventDefault(); setSubjectOpen(false) }}>
                  <span className="text-violet-500">+</span> Use "{subject}"
                </button>
              )}
            </div>
          )}
        </div>
        {/* Exam */}
        <div ref={examRef} className="relative">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-text min-w-[140px] transition-colors"
            style={{ background: 'rgba(14,21,40,0.7)', borderColor: examOpen ? 'rgba(34,211,238,0.4)' : 'rgba(124,58,237,0.22)' }}
            onClick={() => setExamOpen(true)}>
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M14 2H2a1 1 0 00-1 1v2a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1zM2 10h4M2 13h2" />
            </svg>
            <input className="bg-transparent outline-none text-sm text-slate-200 w-full placeholder-slate-600"
              style={{ fontFamily: 'Poppins, sans-serif' }} placeholder="Exam / Category"
              value={exam} onChange={e => { setExam(e.target.value); setExamOpen(true) }} onFocus={() => setExamOpen(true)} />
          </div>
          {examOpen && filteredExams.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 rounded-xl border overflow-hidden w-full min-w-[180px]"
              style={{ background: '#0D1428', borderColor: 'rgba(34,211,238,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {filteredExams.map(e => (
                <button key={e} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors"
                  style={{ fontFamily: 'Poppins, sans-serif' }} onMouseDown={ev => { ev.preventDefault(); setExam(e); setExamOpen(false) }}>{e}</button>
              ))}
              {exam && !EXAM_SUGGESTIONS.map(e => e.toLowerCase()).includes(exam.toLowerCase()) && (
                <button className="w-full text-left px-3 py-2 text-sm border-t flex items-center gap-2 transition-colors"
                  style={{ color: '#67E8F9', borderColor: 'rgba(34,211,238,0.2)', fontFamily: 'Poppins, sans-serif' }}
                  onMouseDown={ev => { ev.preventDefault(); setExamOpen(false) }}>
                  <span className="text-cyan-500">+</span> Use "{exam}"
                </button>
              )}
            </div>
          )}
        </div>
        {/* Topic */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 min-w-[160px] transition-colors"
          style={{ background: 'rgba(14,21,40,0.7)', borderColor: 'rgba(124,58,237,0.22)' }}>
          <Ico n="search" cls="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <input className="bg-transparent outline-none text-sm text-slate-200 flex-1 placeholder-slate-600"
            style={{ fontFamily: 'Poppins, sans-serif' }} placeholder="Topic name"
            value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTopic() }} />
        </div>
        {/* + */}
        <button onClick={addTopic}
          className="w-9 h-9 rounded-xl border flex items-center justify-center text-slate-400 hover:text-violet-300 hover:border-violet-500/40 transition-all flex-shrink-0"
          style={{ background: 'rgba(14,21,40,0.7)', borderColor: 'rgba(124,58,237,0.22)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        {/* QUICK ADD */}
        <button onClick={handleQuickAdd}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.97] flex-shrink-0"
          style={{ fontFamily: 'JetBrains Mono, monospace', background: canAdd ? 'linear-gradient(135deg, #7C3AED, #22D3EE)' : 'rgba(14,21,40,0.7)', color: canAdd ? '#fff' : '#475569', border: '1px solid ' + (canAdd ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)'), boxShadow: canAdd ? '0 0 20px rgba(124,58,237,0.3)' : 'none' }}>
          [QUICK ADD]
        </button>
      </div>
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {topics.map(t => (
            <span key={t} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border"
              style={{ color: '#C4B5FD', background: 'rgba(124,58,237,0.1)', borderColor: 'rgba(124,58,237,0.3)', fontFamily: 'Poppins, sans-serif' }}>
              {t}
              <button onClick={() => removeTopic(t)} className="text-slate-500 hover:text-red-400 transition-colors leading-none">×</button>
            </span>
          ))}
        </div>
      )}
      {added.length > 0 && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-2" style={{ borderColor: 'rgba(124,58,237,0.12)' }}>
          {added.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border group"
              style={{ color: '#67E8F9', background: 'rgba(34,211,238,0.06)', borderColor: 'rgba(34,211,238,0.2)', fontFamily: 'JetBrains Mono, monospace' }}>
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
    low: { text: 'text-emerald-400', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.22)', label: 'Stable' },
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
            <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Review Queue</div>
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
          <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Review Queue</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Topics from previous sessions</div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ color: '#A78BFA', background: 'rgba(124,58,237,0.1)', borderColor: 'rgba(124,58,237,0.3)' }}>{due} due</span>
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
            <div key={subj} className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(124,58,237,0.18)', background: 'rgba(14,21,40,0.5)' }}>
              {/* Subject header — click to expand/collapse */}
              <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(prev => ({ ...prev, [subj]: !isOpen }))}>
                <RetentionRing pct={worstRetention} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>{subj}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{group.length} topic{group.length > 1 ? 's' : ''} pending</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full border font-mono flex-shrink-0 mr-1" style={{ color: t.text, background: t.bg, borderColor: t.border }}>{t.label}</span>
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-500 flex-shrink-0 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
              </button>
              {/* Topic rows */}
              {isOpen && (
                <div className="border-t" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                  {group.map(item => {
                    const tc = tagCls[item.urgency]
                    const daysLabel = item.daysAgo === 1 ? 'Yesterday' : `${item.daysAgo} days ago`
                    return (
                      <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-0 group hover:bg-violet-500/5 transition-colors"
                        style={{ borderColor: 'rgba(124,58,237,0.08)' }}>
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ background: item.urgency === 'high' ? '#F87171' : item.urgency === 'medium' ? '#FBBF24' : '#34D399' }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-slate-300 truncate">{item.topic}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{daysLabel} · {item.retention}% retention</div>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] px-1.5 py-0.5 rounded border font-mono" style={{ color: tc.text, borderColor: tc.border, background: tc.bg }}>{tc.label}</span>
                          <button onClick={() => onDismiss(item.key)}
                            className="text-[11px] px-2 py-1 rounded-lg border transition-all hover:border-emerald-500/50 hover:text-emerald-300"
                            style={{ color: '#C4B5FD', background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.28)', fontFamily: 'Poppins, sans-serif' }}>
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
function FocusPanel({ onGoFocus }: { onGoFocus: () => void }) {
  const sessions = [{ name: 'Mathematics', dur: '45 min', done: true }, { name: 'Physics Review', dur: '30 min', done: true }, { name: 'Chemistry Focus', dur: '75 min', done: false }]
  const pct = 75 / 150
  const arcLen = Math.PI * 56
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Today's Focus</div>
          <div className="text-[11px] text-slate-500 mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>2h 30m planned</div>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400">
          <Ico n="fire" cls="w-3.5 h-3.5" />
          <span className="text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>7-day streak</span>
        </div>
      </div>
      <div className="flex justify-center mb-3">
        <svg width="150" height="86" viewBox="0 0 150 86">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#22D3EE" /></linearGradient>
            <filter id="gaugeGlow"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <path d="M 19,80 A 56,56 0 0,1 131,80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" strokeLinecap="round" />
          <path d="M 19,80 A 56,56 0 0,1 131,80" fill="none" stroke="url(#gaugeGrad)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct * arcLen} ${arcLen}`} filter="url(#gaugeGlow)" />
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const angle = Math.PI * (1 - t)
            const x1 = 75 + 56 * Math.cos(angle), y1 = 80 - 56 * Math.sin(angle)
            const x2 = 75 + 47 * Math.cos(angle), y2 = 80 - 47 * Math.sin(angle)
            return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(124,58,237,0.25)" strokeWidth="1.5" />
          })}
          <text x="75" y="60" textAnchor="middle" fontSize="15" fontWeight="600" fill="#E2E8F0" fontFamily="JetBrains Mono, monospace">1h 15m</text>
          <text x="75" y="75" textAnchor="middle" fontSize="8.5" fill="rgba(148,163,184,0.5)" fontFamily="JetBrains Mono, monospace">of 2h 30m</text>
          <text x="16" y="84" fontSize="8" fill="rgba(148,163,184,0.3)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">0</text>
          <text x="134" y="84" fontSize="8" fill="rgba(148,163,184,0.3)" fontFamily="JetBrains Mono, monospace" textAnchor="middle">2.5h</text>
        </svg>
      </div>
      <div className="space-y-1.5 flex-1">
        {sessions.map((s, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
            style={{ background: s.done ? 'rgba(124,58,237,0.06)' : 'rgba(14,21,40,0.5)', border: '1px solid ' + (s.done ? 'rgba(124,58,237,0.18)' : 'rgba(124,58,237,0.1)') }}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.done ? 'bg-violet-400' : 'bg-slate-600'}`} />
            <span className="text-[11px] flex-1 text-slate-300" style={{ fontFamily: 'Poppins, sans-serif' }}>{s.name}</span>
            <span className="text-[10px] text-slate-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{s.dur}</span>
            {s.done ? <Ico n="check" cls="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />}
          </div>
        ))}
      </div>
      <button onClick={onGoFocus} className="mt-4 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)', fontFamily: 'Poppins, sans-serif', boxShadow: '0 0 24px rgba(124,58,237,0.3)' }}>
        <Ico n="lock" cls="w-4 h-4" />Start Focus Lock
      </button>
    </div>
  )
}

// ─── Study Rooms ──────────────────────────────────────────────────────────────
const ROOMS = [
  { name: 'JEE Physics — Night Grind', cat: 'JEE Advanced', cur: 12, max: 20, cam: 'Cam off', avatars: [{ bg: '#7C3AED', init: 'RS' }, { bg: '#0891B2', init: 'PK' }, { bg: '#EC4899', init: 'AM' }], extra: '+9' },
  { name: 'NEET Biology — Focus Room', cat: 'NEET 2026', cur: 8, max: 15, cam: 'Cam optional', avatars: [{ bg: '#059669', init: 'SK' }, { bg: '#3B82F6', init: 'DL' }, { bg: '#F59E0B', init: 'MK' }], extra: '+5' },
  { name: 'Math Olympiad Prep', cat: 'Competition', cur: 5, max: 10, cam: 'Cam on', avatars: [{ bg: '#F97316', init: 'AK' }, { bg: '#6366F1', init: 'RV' }], extra: '+3' },
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

// ─── Focus Lock Page ──────────────────────────────────────────────────────────
function FocusLockPage({ units, onNavigate }: { units: StudyUnit[]; onNavigate: (id: string) => void }) {
  const [inputH, setInputH] = useState(0)
  const [inputM, setInputM] = useState(25)
  const [inputS, setInputS] = useState(0)
  const [totalSecs, setTotalSecs] = useState(25 * 60)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [activeSubject, setActiveSubject] = useState(0)
  const [subjectTimes, setSubjectTimes] = useState<number[]>([])
  const [quickActive, setQuickActive] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const subjects = units.length > 0
    ? [...new Set(units.map(u => u.subject))]
    : ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English']

  useEffect(() => {
    setSubjectTimes(new Array(subjects.length).fill(0))
  }, [subjects.length])

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) { setRunning(false); return 0 }
          setSubjectTimes(st => { const n = [...st]; n[activeSubject] = (n[activeSubject] || 0) + 1; return n })
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [running, activeSubject])

  const PRESETS = [25, 50, 75, 100]

  function setQuickTime(mins: number, idx: number) {
    const s = mins * 60
    setTotalSecs(s); setRemaining(s); setRunning(false)
    setInputH(0); setInputM(mins); setInputS(0); setQuickActive(idx)
  }

  function applyCustom() {
    const s = inputH * 3600 + inputM * 60 + inputS
    if (s > 0) { setTotalSecs(s); setRemaining(s); setRunning(false) }
    setShowCustom(false); setQuickActive(-1)
  }

  function handleReset() { setRunning(false); setRemaining(totalSecs) }

  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  const f2 = (n: number) => String(n).padStart(2, '0')
  const timeStr = h > 0 ? `${f2(h)}:${f2(m)}:${f2(s)}` : `${f2(m)}:${f2(s)}`
  const maxSubjSecs = Math.max(...subjectTimes, 1)
  const curSubjName = subjects[activeSubject] || 'Physics'
  const curSubjColor = SUBJ_COLORS[activeSubject % SUBJ_COLORS.length]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}>

      {/* ── Fullscreen overlay ── */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8" style={{ background: '#06080F' }}>
          <div className="absolute top-6 right-6">
            <button onClick={() => setFullscreen(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm text-slate-300 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(124,58,237,0.3)', fontFamily: 'Poppins, sans-serif' }}>
              <Ico n="compress" cls="w-4 h-4" /> Exit Fullscreen
            </button>
          </div>
          <div style={{ width: 'min(520px, 80vw)', aspectRatio: '1' }}>
            <TimerCircle remaining={remaining} total={totalSecs} timeStr={timeStr} running={running} size={520} />
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleReset}
              className="w-12 h-12 rounded-full flex items-center justify-center border text-slate-400 hover:text-white transition-colors"
              style={{ borderColor: 'rgba(124,58,237,0.3)', background: 'rgba(255,255,255,0.05)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button onClick={() => setRunning(r => !r)}
              className="px-12 py-3.5 rounded-full text-white font-semibold text-lg flex items-center gap-3 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', boxShadow: '0 0 50px rgba(124,58,237,0.45)', fontFamily: 'Poppins, sans-serif' }}>
              {running
                ? <><svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>Pause</>
                : <><svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>{remaining < totalSecs ? 'Resume' : 'Start'}</>
              }
            </button>
          </div>
          <div className="text-sm text-slate-600 font-mono tracking-wide">{curSubjName} — current focus</div>
        </div>
      )}

      <Sidebar active="focus" setActive={onNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>FOCUS LOCK</div>
            <div className="text-sm font-semibold text-slate-200" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {running ? '● Session running' : remaining < totalSecs ? '⏸ Paused' : 'Ready to focus'}
            </div>
          </div>
          <button onClick={() => setFullscreen(true)}
            className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg border transition-all hover:border-violet-400/40"
            style={{ color: '#A78BFA', background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.22)', fontFamily: 'Poppins, sans-serif' }}>
            <Ico n="expand" cls="w-3.5 h-3.5" /> Fullscreen
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto flex flex-col gap-4 p-5">
          <div className="flex gap-5 flex-1 min-h-0">

            {/* ── LEFT: Timer ── */}
            <div className="flex-1 flex flex-col items-center justify-center gap-5 min-w-0">
              {/* Circle */}
              <div className="relative flex-shrink-0" style={{ width: 'min(320px, 100%)', aspectRatio: '1' }}>
                <TimerCircle remaining={remaining} total={totalSecs} timeStr={timeStr} running={running} size={320} />
              </div>

              {/* Controls */}
              <div className="flex items-center gap-6 w-full max-w-[320px]">
                <div className="flex flex-col items-center gap-1">
                  <button onClick={handleReset}
                    className="w-11 h-11 rounded-full flex items-center justify-center border transition-colors hover:border-slate-500"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                      <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-slate-500">Reset</span>
                </div>

                <button onClick={() => setRunning(r => !r)}
                  className="flex-1 py-3 rounded-full text-white font-semibold text-base flex items-center justify-center gap-2.5 transition-all hover:opacity-90 active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)', boxShadow: '0 0 32px rgba(124,58,237,0.4)', fontFamily: 'Poppins, sans-serif' }}>
                  {running
                    ? <><svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>Pause</>
                    : <><svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M5 3l14 9-14 9V3z" /></svg>{remaining < totalSecs ? 'Resume' : 'Start'}</>
                  }
                </button>

                <div className="flex flex-col items-center gap-1">
                  <button className="w-11 h-11 rounded-full flex items-center justify-center border transition-colors hover:border-slate-500"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }}>
                    <Ico n="bell" cls="w-4 h-4 text-slate-300" />
                  </button>
                  <span className="text-[10px] text-slate-500">Sound</span>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Subject Timer ── */}
            <div className="w-72 flex-shrink-0">
              <div className="rounded-2xl border h-full flex flex-col p-4"
                style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Ico n="target" cls="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Subject Timer</span>
                  </div>
                  <button className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors hover:border-violet-400/40"
                    style={{ color: '#A78BFA', background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.22)', fontFamily: 'Poppins, sans-serif' }}>+ Add</button>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {subjects.map((subj, i) => {
                    const secs = subjectTimes[i] || 0
                    const mins = Math.floor(secs / 60)
                    const isActive = activeSubject === i
                    const color = SUBJ_COLORS[i % SUBJ_COLORS.length]
                    const pct = secs / maxSubjSecs
                    return (
                      <button key={subj} onClick={() => setActiveSubject(i)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                        style={{ background: isActive ? 'rgba(124,58,237,0.12)' : 'rgba(14,21,40,0.5)', borderColor: isActive ? 'rgba(124,58,237,0.45)' : 'rgba(124,58,237,0.12)' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-[11px]"
                          style={{ background: `${color}1A`, border: `1px solid ${color}44`, color }}>
                          {subj.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-slate-200 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>{subj}</span>
                            <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{mins} min</span>
                          </div>
                          <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct * 100}%`, background: `linear-gradient(90deg, ${color}, ${color}bb)` }} />
                          </div>
                        </div>
                        <Ico n="chevR" cls="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      </button>
                    )
                  })}
                </div>

                <button className="mt-3 w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors hover:border-violet-400/30"
                  style={{ background: 'rgba(14,21,40,0.4)', borderColor: 'rgba(124,58,237,0.12)', color: '#94A3B8', fontFamily: 'Poppins, sans-serif' }}>
                  <div className="flex items-center gap-2"><Ico n="progress" cls="w-4 h-4" />View all subjects</div>
                  <Ico n="chevR" cls="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── BOTTOM: Quick Select ── */}
          <div className="rounded-2xl border p-4 flex-shrink-0"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Ico n="zap" cls="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-slate-200" style={{ fontFamily: 'Poppins, sans-serif' }}>Quick Select</span>
              </div>

              <div className="flex items-center gap-2">
                {PRESETS.map((mins, idx) => (
                  <button key={mins} onClick={() => setQuickTime(mins, idx)}
                    className="flex flex-col items-center px-5 py-2.5 rounded-xl border font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                    style={{
                      background: quickActive === idx ? 'linear-gradient(135deg, #7C3AED, #4F46E5)' : 'rgba(14,21,40,0.7)',
                      borderColor: quickActive === idx ? 'rgba(124,58,237,0.6)' : 'rgba(124,58,237,0.2)',
                      boxShadow: quickActive === idx ? '0 0 20px rgba(124,58,237,0.35)' : 'none',
                    }}>
                    <span className="text-lg text-white leading-none" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{mins}</span>
                    <span className="text-[10px] text-white/55 mt-0.5">min</span>
                  </button>
                ))}
              </div>

              <div className="w-px h-10 flex-shrink-0" style={{ background: 'rgba(124,58,237,0.2)' }} />

              <button onClick={() => setShowCustom(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm transition-all hover:border-violet-400/40 flex-shrink-0"
                style={{ background: 'rgba(14,21,40,0.7)', borderColor: 'rgba(124,58,237,0.22)', color: '#A78BFA', fontFamily: 'Poppins, sans-serif' }}>
                <Ico n="cog" cls="w-3.5 h-3.5" /> Custom Timer
              </button>

              {/* Current subject pill */}
              <div className="ml-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border flex-shrink-0"
                style={{ background: 'rgba(14,21,40,0.7)', borderColor: 'rgba(124,58,237,0.22)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                  style={{ background: `${curSubjColor}1A`, color: curSubjColor, border: `1px solid ${curSubjColor}44` }}>
                  {curSubjName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>{curSubjName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Current Subject</div>
                </div>
                <Ico n="chevR" cls="w-3.5 h-3.5 text-slate-600" />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Custom Timer Modal ── */}
      {showCustom && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCustom(false) }}>
          <div className="rounded-2xl border p-8 w-[400px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 80px rgba(124,58,237,0.18)' }}>
            <div className="text-center mb-6">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1.5">CUSTOM TIMER</div>
              <div className="text-lg font-semibold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Set your session time</div>
              <div className="text-xs text-slate-500 mt-1">Up to 99 hours — infinite-length sessions</div>
            </div>
            <div className="flex items-center justify-center gap-4 mb-8">
              <TimeSpinner label="HH" value={inputH} onChange={setInputH} max={99} />
              <div className="text-3xl text-slate-500 font-mono mb-6">:</div>
              <TimeSpinner label="MM" value={inputM} onChange={setInputM} max={59} />
              <div className="text-3xl text-slate-500 font-mono mb-6">:</div>
              <TimeSpinner label="SS" value={inputS} onChange={setInputS} max={59} />
            </div>
            {/* Preview */}
            <div className="text-center mb-6">
              <span className="text-2xl font-mono text-violet-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {f2(inputH)}:{f2(inputM)}:{f2(inputS)}
              </span>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                {inputH * 3600 + inputM * 60 + inputS > 0
                  ? `${inputH * 3600 + inputM * 60 + inputS} seconds total`
                  : 'Set a time above'}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCustom(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.2)', fontFamily: 'Poppins, sans-serif' }}>
                Cancel
              </button>
              <button onClick={applyCustom}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', fontFamily: 'Poppins, sans-serif', boxShadow: '0 0 24px rgba(124,58,237,0.3)' }}>
                Apply Timer
              </button>
            </div>
          </div>
        </div>
      )}
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
  studyTimeSecs: number; isStudying: boolean; cardGrad: string; accentColor: string
}

interface ChatMsg {
  id: string; name: string; text: string; time: string; isBot: boolean; isMe: boolean
}

const ROOM_DATA: RoomData[] = [
  {
    id: 1, name: 'Physics Warriors', emoji: '⚡', classes: 'Class 11 · 12', subject: 'Physics',
    desc: 'Concepts, PYQs, doubts — all in one place.', members: 48,
    avatarColors: ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B'],
    avatarInits: ['RS', 'PK', 'AM', 'DJ'],
    iconBg: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
    iconEmoji: '📘', tag: 'popular', subjectTag: 'physics', isPublic: true,
  },
  {
    id: 2, name: 'Chemistry Crew', emoji: '✨', classes: 'Class 11 · 12', subject: 'Chemistry',
    desc: 'Study. Discuss. Score.', members: 32,
    avatarColors: ['#7C3AED', '#0891B2', '#EC4899', '#F87171'],
    avatarInits: ['SK', 'DL', 'MK', 'RV'],
    iconBg: 'linear-gradient(135deg, #7C3AED, #A855F7)',
    iconEmoji: '🧪', tag: 'popular', subjectTag: 'chemistry', isPublic: true,
  },
  {
    id: 3, name: 'Maths Mavericks', emoji: '', classes: 'Class 10 · 11 · 12', subject: 'Mathematics',
    desc: 'Tricks, practice, progress.', members: 67,
    avatarColors: ['#059669', '#3B82F6', '#F59E0B', '#F97316'],
    avatarInits: ['AK', 'KV', 'PN', 'SR'],
    iconBg: 'linear-gradient(135deg, #0E7490, #22D3EE)',
    iconEmoji: '√x', tag: 'popular', subjectTag: 'maths', isPublic: true,
  },
  {
    id: 4, name: 'Biology Buddies', emoji: '🌿', classes: 'Class 11 · 12', subject: 'Biology',
    desc: 'Learn, revise, ace.', members: 41,
    avatarColors: ['#065F46', '#6366F1', '#F59E0B', '#EC4899'],
    avatarInits: ['VM', 'PR', 'SC', 'AT'],
    iconBg: 'linear-gradient(135deg, #065F46, #34D399)',
    iconEmoji: '📗', tag: 'all', subjectTag: 'biology', isPublic: false, password: 'bio123',
  },
  {
    id: 5, name: 'JEE 2026', emoji: '👑', classes: 'JEE Aspirants', subject: 'All Subjects',
    desc: 'Discipline. Consistency. Results.', members: 89,
    avatarColors: ['#DC2626', '#7C3AED', '#0891B2', '#F59E0B'],
    avatarInits: ['RK', 'AS', 'PG', 'NM'],
    iconBg: 'linear-gradient(135deg, #BE185D, #F43F5E)',
    iconEmoji: '🎯', tag: 'popular', subjectTag: 'all', isPublic: false, password: 'jee2026',
  },
  {
    id: 6, name: 'Night Owls', emoji: '🌙', classes: 'All Classes', subject: 'All Subjects',
    desc: 'Late night study sessions. No distractions.', members: 27,
    avatarColors: ['#1D4ED8', '#6366F1', '#8B5CF6', '#0891B2'],
    avatarInits: ['LD', 'VR', 'AM', 'TR'],
    iconBg: 'linear-gradient(135deg, #1E3A8A, #3B82F6)',
    iconEmoji: '💻', tag: 'all', subjectTag: 'all', isPublic: true,
  },
  {
    id: 7, name: 'Class 12 Board Prep', emoji: '', classes: 'Class 12', subject: 'All Subjects',
    desc: "Let's crack it together!", members: 56,
    avatarColors: ['#7C3AED', '#059669', '#F59E0B', '#EC4899'],
    avatarInits: ['HP', 'GS', 'RT', 'MV'],
    iconBg: 'linear-gradient(135deg, #4338CA, #6366F1)',
    iconEmoji: '👥', tag: 'all', subjectTag: 'all', isPublic: true,
  },
  {
    id: 8, name: 'Productive Humans', emoji: '✨', classes: 'All Classes', subject: 'All Subjects',
    desc: 'Better habits. Bigger dreams.', members: 73,
    avatarColors: ['#7C3AED', '#3B82F6', '#EC4899', '#34D399'],
    avatarInits: ['KD', 'PS', 'YR', 'NB'],
    iconBg: 'linear-gradient(135deg, #5B21B6, #7C3AED)',
    iconEmoji: '✦', tag: 'all', subjectTag: 'all', isPublic: true,
  },
]

// ─── Bot Pool ─────────────────────────────────────────────────────────────────
const BOT_POOL = [
  { name: 'Riya', initials: 'RI', cardGrad: 'linear-gradient(160deg,#0F1729,#1E1244,#2A1860)', accentColor: '#8B5CF6', isStudying: true },
  { name: 'Arjun', initials: 'AR', cardGrad: 'linear-gradient(160deg,#0D2030,#0E3355,#0C4A7A)', accentColor: '#22D3EE', isStudying: true },
  { name: 'Meera', initials: 'ME', cardGrad: 'linear-gradient(160deg,#1A0F28,#2D124A,#3D155C)', accentColor: '#A855F7', isStudying: true },
  { name: 'Dev', initials: 'DE', cardGrad: 'linear-gradient(160deg,#0F1A20,#122A38,#0E3A50)', accentColor: '#06B6D4', isStudying: true },
  { name: 'Anshul', initials: 'AN', cardGrad: 'linear-gradient(160deg,#15101E,#251540,#1E1060)', accentColor: '#7C3AED', isStudying: true },
  { name: 'Nain', initials: 'NA', cardGrad: 'linear-gradient(160deg,#0F1520,#1B2A3C,#223650)', accentColor: '#3B82F6', isStudying: false },
  { name: 'Adarsh', initials: 'AD', cardGrad: 'linear-gradient(160deg,#1A0F15,#2E1228,#3D1535)', accentColor: '#EC4899', isStudying: true },
  { name: 'Jatin', initials: 'JA', cardGrad: 'linear-gradient(160deg,#18101E,#2A1540,#371260)', accentColor: '#A78BFA', isStudying: true },
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
          style={{ background: c, borderColor: '#0A0D1E', zIndex: 4 - i }}>
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
function BotCard({ bot, canKick, onKick }: { bot: BotParticipant; canKick?: boolean; onKick?: () => void }) {
  const fmtTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
  }
  if (!bot.isStudying) {
    return (
      <div className="rounded-2xl border overflow-hidden" style={{ background: '#080C1A', borderColor: 'rgba(100,116,139,0.12)' }}>
        <div className="h-40 flex flex-col items-center justify-center gap-2"
          style={{ background: 'linear-gradient(160deg,#0A0D18,#0D1120)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-slate-500 font-bold text-base"
            style={{ background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.12)' }}>
            {bot.initials}
          </div>
          <div className="text-[10px] text-slate-600 font-mono">offline</div>
        </div>
        <div className="p-3 border-t" style={{ borderColor: 'rgba(100,116,139,0.1)' }}>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-600" /><span className="text-slate-400 font-semibold text-sm">{bot.name}</span></div>
          <div className="text-xs text-slate-500 mt-0.5">{bot.subject}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border overflow-hidden relative" style={{ background: '#080C1A', borderColor: `${bot.accentColor}30` }}>
      <StudyingAvatar cardGrad={bot.cardGrad} accentColor={bot.accentColor} />
      <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <MicOffIcon />
      </div>
      {canKick && (
        <button onClick={onKick}
          className="absolute top-2.5 left-2.5 text-[9px] px-2 py-0.5 rounded-full transition-all hover:bg-red-500/20"
          style={{ background: 'rgba(0,0,0,0.4)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'Poppins, sans-serif' }}>
          Kick
        </button>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-white font-semibold text-sm">{bot.name}</span>
        </div>
        <div className="text-xs text-slate-400">{bot.subject}</div>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
          <Ico n="clock" cls="w-3 h-3" />{fmtTime(bot.studyTimeSecs)}
        </div>
      </div>
    </div>
  )
}

// ─── Study Rooms List Page ─────────────────────────────────────────────────────
function StudyRoomsPage({ onNavigate, onEnterRoom }: {
  onNavigate: (id: string) => void
  onEnterRoom: (room: RoomData) => void
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
      members: 1, avatarColors: ['#7C3AED'], avatarInits: ['AS'],
      iconBg: 'linear-gradient(135deg, #7C3AED, #4F46E5)', iconEmoji: '✦',
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
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}
      onClick={() => setOpenMenuId(null)}>
      <Sidebar active="studyrooms" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>STUDY ROOMS</div>
            <div className="text-sm font-semibold text-slate-200">Find your people. Focus better.</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {/* Hero */}
          <div className="flex items-start justify-between mb-6 gap-6">
            <div>
              <div className="text-[10px] font-mono tracking-[0.22em] text-slate-500 mb-2">STUDY TOGETHER · GROW TOGETHER</div>
              <h1 className="text-4xl font-bold leading-tight mb-2 text-white">
                Study <span style={{ background: 'linear-gradient(90deg,#7C3AED,#A855F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Rooms</span>
              </h1>
              <p className="text-slate-400 text-sm">Find your people. Focus better.</p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex-shrink-0 flex items-center gap-4 p-5 rounded-2xl border relative overflow-hidden hover:scale-[1.02] transition-transform"
              style={{ background: 'linear-gradient(135deg,#2D1B69,#1E3A8A)', borderColor: 'rgba(124,58,237,0.5)', minWidth: '240px', boxShadow: '0 0 40px rgba(124,58,237,0.2)' }}>
              <div className="absolute top-2 right-8 text-2xl opacity-30 select-none">✦</div>
              <div className="absolute top-5 right-4 text-sm opacity-20 select-none">✦</div>
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
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
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border mb-5"
            style={{ background: 'rgba(14,21,40,0.7)', borderColor: 'rgba(124,58,237,0.25)' }}>
            <Ico n="search" cls="w-4 h-4 text-slate-500 flex-shrink-0" />
            <input className="flex-1 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-600"
              placeholder="Search study rooms..." value={search} onChange={e => setSearch(e.target.value)} />
            <kbd className="text-[11px] text-slate-600 border rounded px-1.5 py-0.5"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', fontFamily: 'JetBrains Mono, monospace' }}>⌘ K</kbd>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  background: tab === t.id ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(14,21,40,0.7)',
                  color: tab === t.id ? '#fff' : '#94A3B8',
                  border: `1px solid ${tab === t.id ? 'rgba(124,58,237,0.6)' : 'rgba(124,58,237,0.2)'}`,
                  boxShadow: tab === t.id ? '0 0 16px rgba(124,58,237,0.35)' : 'none',
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
                    background: subjectFilter === s ? 'rgba(124,58,237,0.2)' : 'transparent',
                    color: subjectFilter === s ? '#C4B5FD' : '#64748B',
                    borderColor: subjectFilter === s ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)',
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
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>Create Room</button>
            </div>
          )}

          <div className="space-y-3 pb-8">
            {filtered.map(room => {
              const joined = joinedIds.has(room.id)
              const menuOpen = openMenuId === room.id
              return (
                <div key={room.id}
                  className="flex items-center gap-4 p-4 rounded-2xl border transition-all hover:border-violet-500/40 relative"
                  style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
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
                          style={{ background: 'rgba(52,211,153,0.08)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)' }}>
                          Public
                        </span>
                      )}
                      {room.tag === 'popular' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}>HOT</span>
                      )}
                      {room.isOwner && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                          style={{ background: 'rgba(124,58,237,0.15)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.3)' }}>Owner</span>
                      )}
                    </div>
                    <div className="text-[12px] text-slate-400 mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
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
                          style={{ background: '#0D1428', borderColor: 'rgba(124,58,237,0.35)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                          <button onClick={() => { setInviteRoom(room); setOpenMenuId(null) }}
                            className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-violet-500/10 hover:text-violet-200 transition-colors flex items-center gap-2">
                            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-4l2 2-2 2M14 8H7" /></svg>
                            Invite Friends
                          </button>
                          {joined && (
                            <button onClick={() => handleLeave(room.id)}
                              className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 border-t"
                              style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
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
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', color: '#fff', boxShadow: '0 0 18px rgba(124,58,237,0.4)' }}>
                        Enter →
                      </button>
                    ) : (
                      <button onClick={() => handleJoin(room)}
                        className="px-5 py-2 rounded-full font-semibold text-sm transition-all hover:opacity-90 active:scale-95"
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', color: '#fff', boxShadow: '0 0 18px rgba(124,58,237,0.4)' }}>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={e => { if (e.target === e.currentTarget) setPasswordRoomId(null) }}>
            <div className="rounded-2xl border p-8 w-[360px]"
              style={{ background: '#0A0D1E', borderColor: 'rgba(245,158,11,0.35)', boxShadow: '0 0 60px rgba(245,158,11,0.1)' }}>
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">🔒</div>
                <div className="text-[10px] text-amber-400 font-mono tracking-[0.2em] mb-1">PRIVATE ROOM</div>
                <div className="text-lg font-bold text-white">{room.name}</div>
                <div className="text-sm text-slate-400 mt-1">Enter the room password to join</div>
              </div>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 mb-1 text-center tracking-widest transition-colors"
                style={{ borderColor: passwordError ? 'rgba(248,113,113,0.5)' : 'rgba(124,58,237,0.3)', fontFamily: 'JetBrains Mono, monospace', fontSize: '18px', letterSpacing: '4px' }}
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
                  className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Cancel</button>
                <button onClick={submitPassword}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
                  Enter Room
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Invite Modal */}
      {inviteRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setInviteRoom(null) }}>
          <div className="rounded-2xl border p-8 w-[400px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 60px rgba(124,58,237,0.15)' }}>
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
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
                style={{ background: 'rgba(14,21,40,0.6)', borderColor: 'rgba(124,58,237,0.25)' }}>
                <span className="flex-1 text-sm text-violet-300 truncate" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  wynko.app/rooms/{inviteRoom.name.toLowerCase().replace(/\s+/g, '-')}
                </span>
                <button onClick={() => copyInviteLink(inviteRoom)}
                  className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex-shrink-0"
                  style={{ background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(124,58,237,0.15)', color: copied ? '#34D399' : '#A78BFA', border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(124,58,237,0.3)'}` }}>
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            {!inviteRoom.isPublic && (
              <div className="mb-4 p-3 rounded-xl border"
                style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.2)' }}>
                <div className="text-[11px] text-amber-400 font-mono mb-1">ROOM PASSWORD</div>
                <div className="text-sm text-amber-300">Share the password separately with your friends.</div>
              </div>
            )}
            <div className="flex gap-2">
              {[{ icon: '💬', label: 'WhatsApp' }, { icon: '✈️', label: 'Telegram' }, { icon: '📧', label: 'Email' }].map(opt => (
                <button key={opt.label}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs text-slate-300 hover:text-white transition-colors"
                  style={{ borderColor: 'rgba(124,58,237,0.2)', background: 'rgba(14,21,40,0.5)' }}>
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setInviteRoom(null)}
              className="w-full mt-3 py-2 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
              style={{ borderColor: 'rgba(124,58,237,0.15)' }}>Close</button>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="rounded-2xl border p-7 w-[420px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 80px rgba(124,58,237,0.18)' }}>
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}>
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-0.5">CREATE STUDY ROOM</div>
              <div className="text-lg font-bold text-white">Set up your room</div>
            </div>
            <div className="space-y-3 mb-5">
              <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Room name *" />
              <input value={createForm.subject} onChange={e => setCreateForm(f => ({ ...f, subject: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Subject (e.g. Physics, JEE)" />
              <textarea value={createForm.desc} onChange={e => setCreateForm(f => ({ ...f, desc: e.target.value }))}
                rows={2} className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 resize-none focus:border-violet-500/50 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Short description..." />
              {/* Public / Private toggle */}
              <div className="flex gap-2">
                <button onClick={() => setCreateForm(f => ({ ...f, isPublic: true }))}
                  className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-all"
                  style={{ background: createForm.isPublic ? 'rgba(52,211,153,0.1)' : 'transparent', color: createForm.isPublic ? '#34D399' : '#64748B', borderColor: createForm.isPublic ? 'rgba(52,211,153,0.4)' : 'rgba(124,58,237,0.2)' }}>
                  🌐 Public
                </button>
                <button onClick={() => setCreateForm(f => ({ ...f, isPublic: false }))}
                  className="flex-1 py-2 rounded-xl border text-xs font-semibold transition-all"
                  style={{ background: !createForm.isPublic ? 'rgba(245,158,11,0.1)' : 'transparent', color: !createForm.isPublic ? '#F59E0B' : '#64748B', borderColor: !createForm.isPublic ? 'rgba(245,158,11,0.4)' : 'rgba(124,58,237,0.2)' }}>
                  🔒 Private
                </button>
              </div>
              {!createForm.isPublic && (
                <input value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  type="password"
                  className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-amber-500/50 transition-colors"
                  style={{ borderColor: 'rgba(245,158,11,0.3)' }} placeholder="Set room password" />
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Cancel</button>
              <button onClick={handleCreateRoom}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
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
function RoomInteriorPage({ room, onBack, onNavigate }: {
  room: RoomData; onBack: () => void; onNavigate: (id: string) => void
}) {
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

  const userCard: BotParticipant = {
    id: 'user', name: 'You (Jatin)', initials: 'JS', subject,
    studyTimeSecs: userStudyTime,
    isStudying: focusRunning || userStudyTime > 0,
    cardGrad: 'linear-gradient(160deg,#1A0F35,#2D1555,#3D1870)',
    accentColor: '#7C3AED',
  }

  const allParticipants = [userCard, ...visibleBots]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#060914', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="studyrooms" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center px-6 gap-3 border-b flex-shrink-0"
          style={{ background: 'rgba(6,9,20,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
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
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)' }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Focus timer card */}
          <div className="mx-5 mt-4 mb-3 p-5 rounded-2xl border relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0D1130,#0F1845)', borderColor: 'rgba(124,58,237,0.35)', boxShadow: '0 0 40px rgba(124,58,237,0.1)' }}>
            {/* Background wave */}
            <div className="absolute right-0 top-0 bottom-0 w-48 opacity-20 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at right center,#7C3AED,transparent 70%)' }} />
            <div className="flex items-center gap-6 relative">
              {/* Circular ring + play/pause */}
              <div className="flex-shrink-0 relative" style={{ width: 88, height: 88 }}>
                <svg viewBox="0 0 88 88" width="88" height="88">
                  <defs>
                    <linearGradient id="rg2" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#7C3AED" /><stop offset="100%" stopColor="#60A5FA" />
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
                <div className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
                  {timeStr}
                </div>
                {/* Subject pill */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer hover:border-violet-400/40 transition-colors"
                  style={{ background: 'rgba(124,58,237,0.12)', borderColor: 'rgba(124,58,237,0.3)' }}>
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
                    <div key={p.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white border"
                      style={{ background: p.accentColor, borderColor: '#0D1130', zIndex: 1 }}>{p.initials}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mx-5 mb-3 flex rounded-2xl border overflow-hidden"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)' }}>
            {([['studying', '👥', 'Active Studying'], ['chat', '💬', 'Chat']] as const).map(([id, icon, label]) => (
              <button key={id} onClick={() => setActiveTab(id as 'studying' | 'chat')}
                className="flex-1 flex items-center justify-center gap-2.5 py-3 text-sm font-semibold transition-all"
                style={{
                  color: activeTab === id ? '#A78BFA' : '#64748B',
                  background: activeTab === id ? 'rgba(124,58,237,0.12)' : 'transparent',
                  borderBottom: activeTab === id ? '2px solid #7C3AED' : '2px solid transparent',
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
                  />
                ))}
                {/* Seat available card */}
                <div className="rounded-2xl border overflow-hidden flex flex-col items-center justify-center py-10 cursor-pointer hover:border-violet-500/30 transition-colors"
                  style={{ background: 'rgba(14,21,40,0.35)', borderColor: 'rgba(124,58,237,0.18)', borderStyle: 'dashed' }}>
                  <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center mb-3"
                    style={{ borderColor: 'rgba(124,58,237,0.35)' }}>
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
                      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)' }}>🔒</div>
                    <div className="text-slate-200 font-bold text-base">Chat is locked during focus study</div>
                    <div className="text-slate-400 text-sm leading-relaxed">
                      Finish your focus time to unlock chat.<br />
                      <span className="text-violet-400">Chat opens during breaks only.</span>
                    </div>
                    <button onClick={() => { setFocusRunning(false) }}
                      className="mt-2 px-6 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
                      Pause & Open Chat
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 pb-3" style={{ minHeight: '300px' }}>
                      {messages.map(msg => (
                        <div key={msg.id} className={`flex gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ background: msg.isMe ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(124,58,237,0.25)' }}>
                            {msg.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className={`flex flex-col gap-0.5 max-w-[70%] ${msg.isMe ? 'items-end' : ''}`}>
                            {!msg.isMe && <span className="text-[10px] text-slate-500 font-mono">{msg.name}</span>}
                            <div className="px-3.5 py-2 rounded-2xl text-sm text-slate-200"
                              style={{ background: msg.isMe ? 'rgba(124,58,237,0.25)' : 'rgba(14,21,40,0.7)', border: `1px solid ${msg.isMe ? 'rgba(124,58,237,0.3)' : 'rgba(124,58,237,0.1)'}` }}>
                              {msg.text}
                            </div>
                            <span className="text-[9px] text-slate-600 font-mono">{msg.time}</span>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
                      <input
                        className="flex-1 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/40 transition-colors"
                        style={{ background: 'rgba(14,21,40,0.6)', borderColor: 'rgba(124,58,237,0.2)' }}
                        placeholder="Type a message..."
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      />
                      <button onClick={sendMessage}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>
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
        <circle cx="28" cy="28" r="27" stroke={color} strokeWidth="2" fill="#0A0D1E" />
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
  physics: '#3B82F6', chemistry: '#A855F7', mathematics: '#22D3EE', maths: '#22D3EE',
  biology: '#34D399', history: '#F59E0B', geography: '#F87171', english: '#EC4899',
  economics: '#6366F1', computer: '#06B6D4',
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

const SUBJECT_COLORS = ['#3B82F6', '#A855F7', '#22D3EE', '#34D399', '#F59E0B', '#F87171', '#EC4899']

function SchedulesPage({ onNavigate, schedule, setSchedule, sharedUnits, setSharedUnits }: {
  onNavigate: (id: string) => void
  schedule: ScheduleItem[][]
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[][]>>
  sharedUnits: StudyUnit[]
  setSharedUnits: React.Dispatch<React.SetStateAction<StudyUnit[]>>
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
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="schedules" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>SCHEDULES & BLOCKERS</div>
            <div className="text-sm font-semibold text-slate-200">Build your perfect study routine.</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)' }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Page title */}
          <div>
            <h1 className="text-2xl font-bold text-white">Schedule & Blockers</h1>
            <p className="text-slate-400 text-sm mt-0.5">Build your perfect study routine and stay distraction-free.</p>
          </div>

          {/* ── AI Assistant Banner ── */}
          <div className="rounded-2xl border p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0F1535,#141B40)', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 40px rgba(124,58,237,0.1)' }}>
            <div className="absolute right-0 top-0 bottom-0 w-40 opacity-15 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at right,#7C3AED,transparent)' }} />
            <div className="flex items-center gap-5 relative">
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-4xl"
                style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.3),rgba(99,102,241,0.2))', border: '1px solid rgba(124,58,237,0.4)' }}>
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-violet-400 font-mono tracking-[0.15em] mb-0.5">AI ASSISTANT</div>
                <div className="text-lg font-bold text-white mb-0.5">Create Your Study Schedule</div>
                <div className="text-sm text-slate-400 leading-relaxed">Tell us your subjects, goals and available time. Our AI will build a personalized plan for you.</div>
              </div>
              <button onClick={() => { setShowAI(true); setAiStep('form') }}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-white text-sm transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 24px rgba(124,58,237,0.4)' }}>
                ✦ Generate with AI
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* ── Your Schedule ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
                  <Ico n="clock" cls="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">Your Schedule</div>
                  <div className="text-[11px] text-slate-500">Stay consistent. Track your progress.</div>
                </div>
              </div>
              <button onClick={() => setEditMode(e => !e)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-sm transition-all"
                style={{ borderColor: editMode ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.25)', color: editMode ? '#A78BFA' : '#64748B', background: editMode ? 'rgba(124,58,237,0.12)' : 'transparent' }}>
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
                    background: activeDay === i ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(14,21,40,0.5)',
                    border: `1px solid ${activeDay === i ? 'rgba(124,58,237,0.6)' : 'rgba(124,58,237,0.15)'}`,
                    boxShadow: activeDay === i ? '0 0 16px rgba(124,58,237,0.35)' : 'none',
                  }}>
                  <span className="text-[10px] font-semibold" style={{ color: activeDay === i ? 'rgba(255,255,255,0.75)' : '#64748B' }}>{day}</span>
                  <span className="text-base font-bold leading-tight" style={{ color: activeDay === i ? '#fff' : '#475569', fontFamily: 'JetBrains Mono, monospace' }}>{weekDates[i]}</span>
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
                  className="flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:border-violet-500/30 group"
                  style={{ background: 'rgba(14,21,40,0.5)', borderColor: 'rgba(124,58,237,0.15)' }}>
                  {editMode && (
                    <button onClick={() => deleteSession(session.id)}
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}>
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
                  <div className="text-[11px] text-slate-400 mr-3 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {session.startTime} – {session.endTime}
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white flex-shrink-0 transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 12px rgba(124,58,237,0.3)' }}>
                    🎯 Focus Mode
                  </button>
                  <Ico n="chevR" cls="w-4 h-4 text-slate-600" />
                </div>
              ))}
            </div>

            {/* Add new */}
            <button onClick={() => setShowAddSession(true)}
              className="w-full flex items-center gap-3 px-5 py-4 border-t transition-all hover:bg-white/[0.02] group"
              style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
              <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: 'rgba(124,58,237,0.4)', borderStyle: 'dashed' }}>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </div>
              <span className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">Add New Schedule</span>
              <Ico n="chevR" cls="w-4 h-4 text-slate-600 ml-auto" />
            </button>
          </div>

          {/* ── Block Distracting Apps & Websites ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
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
                      style={{ background: blocked ? 'rgba(124,58,237,0.08)' : 'rgba(14,21,40,0.5)', borderColor: blocked ? 'rgba(124,58,237,0.45)' : 'rgba(124,58,237,0.15)' }}>
                      {blocked && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#7C3AED' }}>
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
                  style={{ background: 'rgba(14,21,40,0.5)', borderColor: 'rgba(124,58,237,0.15)', borderStyle: 'dashed' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)' }}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </div>
                  <span className="text-[10px] text-slate-400">More</span>
                </button>
              </div>
            </div>

            {/* Website blocker */}
            <div className="px-5 pb-5 border-t pt-4" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
              <div className="text-[10px] text-slate-500 font-mono mb-3">WEBSITES</div>
              <div className="flex gap-2 mb-3">
                <input value={websiteInput} onChange={e => setWebsiteInput(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                  style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="e.g. youtube.com, reddit.com..."
                  onKeyDown={e => e.key === 'Enter' && addBlockedWebsite()} />
                <button onClick={addBlockedWebsite}
                  className="px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>Block</button>
              </div>
              {blockedWebsites.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-2">No websites blocked yet. Add URLs above.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {blockedWebsites.map(w => (
                    <div key={w} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px]"
                      style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
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
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>⏰</div>
                <div>
                  <div className="text-base font-bold text-white">Create Focus Routine</div>
                  <div className="text-[11px] text-slate-500">Set blocking rules once, activate like an alarm when needed.</div>
                </div>
              </div>
              <button onClick={() => setShowCreateRoutine(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}>
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
                  style={{ background: 'rgba(14,21,40,0.5)', borderColor: routine.enabled ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.15)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-white">{routine.name}</span>
                      {routine.enabled && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.25)' }}>ACTIVE</span>
                      )}
                    </div>
                    <button
                      onClick={() => setRoutines(prev => prev.map(r => r.id === routine.id ? { ...r, enabled: !r.enabled } : r))}
                      className="w-11 h-6 rounded-full transition-all flex-shrink-0 relative"
                      style={{ background: routine.enabled ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(100,116,139,0.3)', boxShadow: routine.enabled ? '0 0 12px rgba(124,58,237,0.4)' : 'none' }}>
                      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow-md"
                        style={{ left: routine.enabled ? 'calc(100% - 22px)' : '2px' }} />
                    </button>
                  </div>

                  {/* Days */}
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {DAYS_SHORT.map((day, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: routine.days.includes(i) ? 'rgba(124,58,237,0.2)' : 'rgba(14,21,40,0.5)',
                          color: routine.days.includes(i) ? '#C4B5FD' : '#475569',
                          border: `1px solid ${routine.days.includes(i) ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.1)'}`,
                        }}>{day}</span>
                    ))}
                  </div>

                  {/* Info row */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Ico n="clock" cls="w-3 h-3 text-violet-400" />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmtTime(routine.timeFrom)} → {fmtTime(routine.timeTo)}</span>
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

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget && aiStep !== 'generating') setShowAI(false) }}>
          <div className="rounded-2xl border w-[460px] overflow-hidden"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 80px rgba(124,58,237,0.2)' }}>
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
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Physics, Chemistry, Mathematics..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-1 block">TARGET EXAM / GOAL</label>
                    <input value={aiForm.exam} onChange={e => setAiForm(f => ({ ...f, exam: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="JEE Advanced, NEET, Board Exams..." />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-mono mb-2 block">AVAILABLE HOURS PER DAY</label>
                    <div className="flex gap-2">
                      {['4', '6', '8', '10', '12'].map(h => (
                        <button key={h} onClick={() => setAiForm(f => ({ ...f, hoursPerDay: h }))}
                          className="flex-1 py-2 rounded-xl border text-sm font-semibold transition-all"
                          style={{ background: aiForm.hoursPerDay === h ? 'rgba(124,58,237,0.2)' : 'transparent', color: aiForm.hoursPerDay === h ? '#C4B5FD' : '#64748B', borderColor: aiForm.hoursPerDay === h ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.2)' }}>
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAI(false)}
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Cancel</button>
                  <button onClick={generateAI}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 24px rgba(124,58,237,0.3)' }}>
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
                <div className="rounded-xl border p-4 mb-5 space-y-2.5" style={{ background: 'rgba(14,21,40,0.5)', borderColor: 'rgba(124,58,237,0.2)' }}>
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
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Regenerate</button>
                  <button onClick={applyAISchedule}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>Apply Schedule</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Session Modal ── */}
      {showAddSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddSession(false) }}>
          <div className="rounded-2xl border p-7 w-[420px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 60px rgba(124,58,237,0.18)' }}>
            <div className="text-center mb-5">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">NEW SESSION</div>
              <div className="text-lg font-bold text-white">Add Study Session</div>
              <div className="text-sm text-slate-400 mt-0.5">{DAYS_SHORT[activeDay]}, {weekDates[activeDay]}</div>
            </div>
            <div className="space-y-3 mb-5">
              <input value={newSession.subject} onChange={e => setNewSession(s => ({ ...s, subject: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Subject (e.g. Physics)" />
              <input value={newSession.topic} onChange={e => setNewSession(s => ({ ...s, topic: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="Topic (e.g. Chapter 5 – Current Electricity)" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 mb-1 block font-mono">FROM</label>
                  <input value={newSession.startTime} onChange={e => setNewSession(s => ({ ...s, startTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600"
                    style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="9:00 AM" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-500 mb-1 block font-mono">TO</label>
                  <input value={newSession.endTime} onChange={e => setNewSession(s => ({ ...s, endTime: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600"
                    style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="11:00 AM" />
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
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Cancel</button>
              <button onClick={addSession}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>Add Session</button>
            </div>
          </div>
        </div>
      )}

      {/* ── All Apps Modal ── */}
      {showMoreApps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowMoreApps(false) }}>
          <div className="rounded-2xl border p-7 w-[480px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 60px rgba(124,58,237,0.18)' }}>
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
                    style={{ background: blocked ? 'rgba(124,58,237,0.1)' : 'rgba(14,21,40,0.5)', borderColor: blocked ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)' }}>
                    {blocked && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: '#7C3AED' }}>
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
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>Done</button>
          </div>
        </div>
      )}

      {/* ── Create Focus Routine Modal ── */}
      {showCreateRoutine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateRoutine(false) }}>
          <div className="rounded-2xl border w-[500px] overflow-hidden" style={{ maxHeight: '90vh', background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.4)', boxShadow: '0 0 80px rgba(124,58,237,0.18)' }}>
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
                      className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} placeholder="e.g. Study Week, Morning Focus, Exam Mode..." />
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
                            style={{ background: sel ? 'rgba(124,58,237,0.2)' : 'rgba(14,21,40,0.5)', color: sel ? '#C4B5FD' : '#64748B', borderColor: sel ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)' }}>
                            {day}
                          </button>
                        )
                      })}
                      <button onClick={() => setNewRoutine(r => ({ ...r, days: r.days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6] }))}
                        className="px-3.5 py-2 rounded-xl border text-sm font-semibold transition-all"
                        style={{ borderColor: 'rgba(124,58,237,0.2)', color: '#64748B', background: 'transparent' }}>
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
                        style={{ borderColor: 'rgba(124,58,237,0.25)', colorScheme: 'dark' }} />
                      <span className="text-slate-500">→</span>
                      <input type="time" value={newRoutine.timeTo} onChange={e => setNewRoutine(r => ({ ...r, timeTo: e.target.value }))}
                        className="flex-1 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors"
                        style={{ borderColor: 'rgba(124,58,237,0.25)', colorScheme: 'dark' }} />
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
                            style={{ background: sel ? 'rgba(124,58,237,0.1)' : 'rgba(14,21,40,0.5)', borderColor: sel ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.12)' }}>
                            {sel && (
                              <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#7C3AED' }}>
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
                            style={{ background: sel ? 'rgba(124,58,237,0.15)' : 'rgba(14,21,40,0.5)', color: sel ? '#C4B5FD' : '#64748B', borderColor: sel ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.12)' }}>
                            {sel ? '✓ ' : ''}{w}
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex gap-2">
                      <input value={newRoutine.customWebsite} onChange={e => setNewRoutine(r => ({ ...r, customWebsite: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/40 transition-colors"
                        style={{ borderColor: 'rgba(124,58,237,0.2)' }} placeholder="Add custom URL (e.g. example.com)"
                        onKeyDown={e => e.key === 'Enter' && addCustomWebsite()} />
                      <button onClick={addCustomWebsite}
                        className="px-4 py-2 rounded-xl text-violet-400 border transition-colors hover:border-violet-400/40"
                        style={{ borderColor: 'rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)' }}>Add</button>
                    </div>
                    {newRoutine.websites.filter(w => !WEBSITE_SUGGESTIONS.includes(w)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {newRoutine.websites.filter(w => !WEBSITE_SUGGESTIONS.includes(w)).map(w => (
                          <span key={w} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border"
                            style={{ color: '#67E8F9', background: 'rgba(34,211,238,0.06)', borderColor: 'rgba(34,211,238,0.2)' }}>
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
                    className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Cancel</button>
                  <button onClick={createRoutine}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>Create Routine</button>
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
  { label: 'First Battle', sub: '1 win', tier: 'Bronze', emoji: '🏆', color: '#CD7F32', bg: 'rgba(205,127,50,0.12)', border: 'rgba(205,127,50,0.35)' },
  { label: '5 Wins', sub: '5 battles', tier: 'Silver', emoji: '🏆', color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)' },
  { label: '10 Wins', sub: '10 battles', tier: 'Gold', emoji: '🏆', color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.4)' },
  { label: '20 Wins', sub: '20 battles', tier: 'Diamond', emoji: '💎', color: '#B9F2FF', bg: 'rgba(185,242,255,0.08)', border: 'rgba(185,242,255,0.3)' },
]

const BATTLE_BOTS = [
  { name: 'Aryan', color: '#F59E0B', variant: 1 },
  { name: 'Meera', color: '#A855F7', variant: 2 },
  { name: 'Arjun', color: '#22D3EE', variant: 1 },
  { name: 'Dev', color: '#06B6D4', variant: 3 },
  { name: 'Riya', color: '#EC4899', variant: 0 },
  { name: 'Nain', color: '#3B82F6', variant: 3 },
]

const RECENT_BATTLES_DATA = [
  { leftName: 'You', leftColor: '#7C3AED', leftVariant: 0, leftWon: true, rightName: 'Nain', rightColor: '#3B82F6', rightVariant: 3, time: '2h ago', pts: '+15' },
  { leftName: 'Meera', leftColor: '#A855F7', leftVariant: 2, leftWon: true, rightName: 'Arjun', rightColor: '#22D3EE', rightVariant: 1, time: '5h ago', pts: '+12' },
  { leftName: 'Dev', leftColor: '#06B6D4', leftVariant: 3, leftWon: true, rightName: 'Riya', rightColor: '#EC4899', rightVariant: 0, time: '1d ago', pts: '+10' },
]

const LEADERBOARD_DATA = [
  { rank: 2, name: 'Meera', wins: 10, streak: 6, color: '#A855F7', variant: 2 },
  { rank: 1, name: 'Aryan', wins: 12, streak: 8, color: '#F59E0B', variant: 1, isFirst: true },
  { rank: 3, name: 'Nain', wins: 8, streak: 5, color: '#3B82F6', variant: 3 },
]

function BattlegroundPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  type BattlePhase = 'idle' | 'invite-sent' | 'accepted' | 'active' | 'finished'

  interface PendingInvite { id: string; name: string; color: string; variant: number; msg: string }

  const [phase, setPhase] = useState<BattlePhase>('idle')
  const [inviteInput, setInviteInput] = useState('')
  const [opponent, setOpponent] = useState<{ name: string; color: string; variant: number } | null>(null)
  const [battleSecs, setBattleSecs] = useState(0)
  const [myStudySecs, setMyStudySecs] = useState(0)
  const [oppStudySecs, setOppStudySecs] = useState(0)
  const [winner, setWinner] = useState<'you' | 'opponent' | null>(null)
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false)
  const [showAllTrophies, setShowAllTrophies] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([
    { id: 'pi1', name: 'Aryan', color: '#F59E0B', variant: 1, msg: 'wants to battle you! ⚔️' },
    { id: 'pi2', name: 'Meera', color: '#A855F7', variant: 2, msg: 'challenged you to a duel!' },
  ])
  const battleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const acceptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (phase === 'active') {
      battleRef.current = setInterval(() => {
        setBattleSecs(s => s + 1)
        setMyStudySecs(s => s + 1)
        setOppStudySecs(s => s + 1)
      }, 1000)
    } else {
      if (battleRef.current) clearInterval(battleRef.current)
    }
    return () => { if (battleRef.current) clearInterval(battleRef.current) }
  }, [phase])

  useEffect(() => {
    return () => {
      if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current)
      if (battleRef.current) clearInterval(battleRef.current)
    }
  }, [])

  function fmt(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
    return `${String(m).padStart(2,'0')}m ${String(sec).padStart(2,'0')}s`
  }

  function sendInvite() {
    const name = inviteInput.trim()
    if (!name) return
    const bot = BATTLE_BOTS.find(b => b.name.toLowerCase() === name.toLowerCase()) ||
      { name, color: '#7C3AED', variant: 0 }
    setOpponent(bot)
    setPhase('invite-sent')
    setInviteInput('')
    acceptTimerRef.current = setTimeout(() => setPhase('accepted'), 3000)
  }

  function acceptInvite(inv: PendingInvite) {
    setOpponent({ name: inv.name, color: inv.color, variant: inv.variant })
    setPendingInvites(prev => prev.filter(p => p.id !== inv.id))
    setPhase('accepted')
    setBattleSecs(0); setMyStudySecs(0); setOppStudySecs(0); setWinner(null)
  }

  function rejectInvite(id: string) {
    setPendingInvites(prev => prev.filter(p => p.id !== id))
  }

  function startBattle() {
    setBattleSecs(0); setMyStudySecs(0); setOppStudySecs(0); setWinner(null)
    setPhase('active')
  }

  function endMyTimer() {
    setPhase('finished')
    setWinner('opponent')
  }

  function cancelInvite() {
    if (acceptTimerRef.current) clearTimeout(acceptTimerRef.current)
    setPhase('idle'); setOpponent(null)
  }

  function resetBattle() {
    setPhase('idle'); setOpponent(null); setWinner(null)
    setBattleSecs(0); setMyStudySecs(0); setOppStudySecs(0)
  }

  const TROPHY_TIERS = [
    { label: 'First Battle', sub: '1 win', tier: 'Bronze', emoji: '🏆', color: '#CD7F32', bg: 'rgba(205,127,50,0.12)', border: 'rgba(205,127,50,0.35)' },
    { label: '5 Wins', sub: '5 battles', tier: 'Silver', emoji: '🏆', color: '#C0C0C0', bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)' },
    { label: '10 Wins', sub: '10 battles', tier: 'Gold', emoji: '🏆', color: '#FFD700', bg: 'rgba(255,215,0,0.12)', border: 'rgba(255,215,0,0.4)' },
    { label: '20 Wins', sub: '20 battles', tier: 'Diamond', emoji: '💎', color: '#B9F2FF', bg: 'rgba(185,242,255,0.08)', border: 'rgba(185,242,255,0.3)' },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="battleground" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>BATTLEGROUND</div>
            <div className="text-sm font-semibold text-slate-200">Challenge. Compete. Win.</div>
          </div>
          <div className="relative p-2 text-slate-400">
            <Ico n="bell" cls="w-5 h-5" />
            {pendingInvites.length > 0 && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: '#7C3AED' }}>{pendingInvites.length}</div>
            )}
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)' }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Page title */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.35),rgba(99,102,241,0.25))', border: '1px solid rgba(124,58,237,0.5)', boxShadow: '0 0 20px rgba(124,58,237,0.25)' }}>
              ⚔️
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Battleground</h1>
              <p className="text-slate-400 text-sm">Challenge your friends. Stay consistent. Win together.</p>
            </div>
          </div>

          {/* ── Invitations Inbox ── */}
          {pendingInvites.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.35)' }}>
              <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <div className="text-sm font-bold text-white">Battle Invitations</div>
                <div className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(124,58,237,0.2)', color: '#C4B5FD' }}>{pendingInvites.length} pending</div>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 p-3.5 rounded-xl border" style={{ background: 'rgba(124,58,237,0.06)', borderColor: 'rgba(124,58,237,0.25)' }}>
                    <BattleAvatar color={inv.color} variant={inv.variant} size={40} glow />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-white">{inv.name}</span>
                      <span className="text-sm text-slate-400"> {inv.msg}</span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => rejectInvite(inv.id)}
                        className="px-3 py-1.5 rounded-full text-[11px] font-semibold border text-slate-400 hover:text-slate-200 transition-colors"
                        style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Reject</button>
                      <button onClick={() => acceptInvite(inv)}
                        className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 12px rgba(124,58,237,0.35)' }}>Accept ⚔️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Active Battle Card ── */}
          <div className="rounded-2xl border overflow-hidden relative"
            style={{ background: 'linear-gradient(160deg,#080B1A,#12083A,#080E28)', borderColor: 'rgba(124,58,237,0.5)', boxShadow: '0 0 40px rgba(124,58,237,0.15)' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 20% 50%,rgba(34,211,238,0.07),transparent 55%), radial-gradient(ellipse at 80% 50%,rgba(236,72,153,0.07),transparent 55%)' }} />

            {/* Badge row */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 relative z-10">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
                style={{ background: phase === 'active' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)', border: `1px solid ${phase === 'active' ? 'rgba(239,68,68,0.35)' : 'rgba(124,58,237,0.3)'}`, color: phase === 'active' ? '#FCA5A5' : '#C4B5FD' }}>
                {phase === 'active' ? '🔥 Battle Live' : phase === 'finished' ? '🏁 Battle Ended' : '⚔️ Battle Arena'}
              </div>
              {phase === 'active' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', color: '#34D399' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Live Now
                </div>
              )}
            </div>

            {/* Finished overlay */}
            {phase === 'finished' && winner && (
              <div className="relative z-10 mx-5 mb-3 p-5 rounded-2xl border text-center"
                style={{ background: winner === 'you' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', borderColor: winner === 'you' ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.4)' }}>
                <div className="text-3xl mb-1">{winner === 'you' ? '🏆' : '💔'}</div>
                <div className="text-lg font-bold text-white">{winner === 'you' ? 'You Won!' : `${opponent?.name} Won!`}</div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {winner === 'you' ? `${opponent?.name} ended their session first.` : 'You ended your session first.'}
                </div>
                <div className="text-[11px] font-mono mt-2" style={{ color: '#A78BFA' }}>Battle time: {fmt(battleSecs)}</div>
                <button onClick={resetBattle}
                  className="mt-3 px-6 py-2 rounded-full text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>New Battle</button>
              </div>
            )}

            {/* Players row */}
            <div className="flex items-center gap-3 px-5 py-4 relative z-10">
              {/* You */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <BattleAvatar color="#7C3AED" variant={0} size={68} ringColor="#22D3EE" glow />
                <div className="text-center">
                  <div className="flex items-center gap-1.5 justify-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-base font-bold text-white">You</span>
                  </div>
                  {phase === 'active' || phase === 'finished' ? (
                    <div className="text-[11px] font-mono text-violet-300 mt-0.5">{fmt(myStudySecs)} studied</div>
                  ) : (
                    <div className="text-[10px] text-emerald-400">● Online</div>
                  )}
                </div>
                {phase === 'active' && (
                  <button onClick={endMyTimer}
                    className="px-4 py-2 rounded-full text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)', color: '#FCA5A5', boxShadow: '0 0 12px rgba(239,68,68,0.2)' }}>
                    🛑 End Timer
                  </button>
                )}
              </div>

              {/* Center — VS + invite */}
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <div className="text-4xl font-black"
                  style={{ fontFamily: 'JetBrains Mono, monospace', background: 'linear-gradient(135deg,#7C3AED,#EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 12px rgba(124,58,237,0.5))' }}>
                  VS
                </div>

                {/* Battle timer */}
                {(phase === 'active' || phase === 'finished') && (
                  <div className="px-4 py-2 rounded-xl text-center" style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                    <div className="text-[9px] text-slate-500 font-mono mb-0.5">BATTLE TIME</div>
                    <div className="text-base font-black text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(battleSecs)}</div>
                  </div>
                )}

                {/* Idle — invite input */}
                {phase === 'idle' && (
                  <div className="flex flex-col items-center gap-2 w-48">
                    <div className="text-[10px] text-slate-500 font-mono">INVITE A USER</div>
                    <input value={inviteInput} onChange={e => setInviteInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 text-center focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.35)' }} placeholder="Enter username..."
                      onKeyDown={e => e.key === 'Enter' && sendInvite()} />
                    <button onClick={sendInvite} disabled={!inviteInput.trim()}
                      className="w-full py-2 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 14px rgba(124,58,237,0.35)' }}>
                      Send Invite ⚔️
                    </button>
                  </div>
                )}

                {/* Invite sent — waiting */}
                {phase === 'invite-sent' && (
                  <div className="flex flex-col items-center gap-2 w-44 text-center">
                    <div className="flex gap-1 justify-center">
                      {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: `${i*0.2}s` }} />)}
                    </div>
                    <div className="text-[11px] text-slate-400">Waiting for<br /><span className="text-violet-300 font-semibold">{opponent?.name}</span>...</div>
                    <button onClick={cancelInvite} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
                  </div>
                )}

                {/* Accepted — start battle */}
                {phase === 'accepted' && (
                  <div className="flex flex-col items-center gap-2 w-44 text-center">
                    <div className="text-[11px] text-emerald-400 font-semibold">✓ {opponent?.name} accepted!</div>
                    <button onClick={startBattle}
                      className="px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95"
                      style={{ background: 'linear-gradient(135deg,#7C3AED,#EC4899)', boxShadow: '0 0 20px rgba(124,58,237,0.5)' }}>
                      ▶ Start Battle
                    </button>
                  </div>
                )}
              </div>

              {/* Opponent */}
              <div className="flex-1 flex flex-col items-center gap-2">
                {opponent ? (
                  <>
                    <BattleAvatar color={opponent.color} variant={opponent.variant} size={68} ringColor="#EC4899" glow />
                    <div className="text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-base font-bold text-white">{opponent.name}</span>
                      </div>
                      {phase === 'active' || phase === 'finished' ? (
                        <div className="text-[11px] font-mono mt-0.5" style={{ color: opponent.color }}>{fmt(oppStudySecs)} studied</div>
                      ) : (
                        <div className="text-[10px] text-emerald-400">● Online</div>
                      )}
                    </div>
                    {phase === 'active' && (
                      <div className="px-4 py-2 rounded-full text-[11px] font-bold border"
                        style={{ background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.25)', color: '#34D399' }}>
                        ⏱ Studying...
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-[68px] h-[68px] rounded-full border-2 flex items-center justify-center"
                      style={{ borderColor: 'rgba(124,58,237,0.3)', borderStyle: 'dashed', background: 'rgba(124,58,237,0.05)' }}>
                      <svg viewBox="0 0 24 24" className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M20 8v6M23 11h-6" /><circle cx="9" cy="7" r="4" /></svg>
                    </div>
                    <div className="text-[11px] text-slate-600 text-center">No opponent yet</div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom stats */}
            {(phase === 'active' || phase === 'finished') && (
              <div className="flex items-center mx-4 mb-4 rounded-xl border overflow-hidden relative z-10"
                style={{ borderColor: 'rgba(124,58,237,0.2)', background: 'rgba(10,13,30,0.7)' }}>
                <div className="flex-1 flex items-center gap-2.5 px-4 py-3 border-r" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
                  <span className="text-lg">⏱️</span>
                  <div>
                    <div className="text-[10px] text-slate-500">Battle Time</div>
                    <div className="text-sm font-bold text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(battleSecs)}</div>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2.5 px-4 py-3 border-r" style={{ borderColor: 'rgba(124,58,237,0.2)' }}>
                  <span className="text-lg">🔥</span>
                  <div>
                    <div className="text-[10px] text-slate-500">Your Study Time</div>
                    <div className="text-sm font-bold text-violet-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(myStudySecs)}</div>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2.5 px-4 py-3">
                  <span className="text-lg">⚡</span>
                  <div>
                    <div className="text-[10px] text-slate-500">{opponent?.name || "Opp"}'s Study Time</div>
                    <div className="text-sm font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: opponent?.color || '#22D3EE' }}>{fmt(oppStudySecs)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Trophies & Rewards ── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.3)' }}>🏆</div>
                <div>
                  <div className="text-base font-bold text-white">Trophies & Rewards</div>
                  <div className="text-[11px] text-violet-400 mt-0.5">Study more. Earn trophies. Unlock exclusive rewards.</div>
                </div>
              </div>
              <button onClick={() => setShowAllTrophies(true)} className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                View All <Ico n="chevR" cls="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              {TROPHY_TIERS.map(t => (
                <div key={t.tier} className="flex-1 flex flex-col items-center p-3.5 rounded-2xl border text-center"
                  style={{ background: t.bg, borderColor: t.border, boxShadow: `0 0 16px ${t.color}20` }}>
                  <span className="text-2xl mb-1.5" style={{ filter: `drop-shadow(0 0 8px ${t.color}80)` }}>{t.emoji}</span>
                  <div className="text-xs font-bold text-white">{t.label}</div>
                  <div className="text-[10px] text-slate-400 mb-2">({t.sub})</div>
                  <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}44` }}>{t.tier}</div>
                </div>
              ))}
              <div className="flex flex-col items-start justify-between p-4 rounded-2xl border min-w-[130px]"
                style={{ background: 'rgba(124,58,237,0.08)', borderColor: 'rgba(124,58,237,0.3)' }}>
                <div className="text-xs font-semibold text-slate-200 leading-snug mb-3">Win battles &<br />get exclusive<br />rewards</div>
                <div className="flex items-center gap-1.5 w-full">
                  {['👑','👕','🎭'].map((e, i) => (
                    <div key={i} className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                      style={{ background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.25)' }}>{e}</div>
                  ))}
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center ml-auto" style={{ background: 'rgba(124,58,237,0.15)' }}>
                    <Ico n="chevR" cls="w-3.5 h-3.5 text-violet-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Battles ── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="text-base font-bold text-white">Recent Battles</div>
              <button className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                See All <Ico n="chevR" cls="w-3 h-3" />
              </button>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {RECENT_BATTLES_DATA.map((b, i) => (
                <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl border"
                  style={{ background: 'rgba(14,21,40,0.5)', borderColor: 'rgba(124,58,237,0.15)' }}>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <BattleAvatar color={b.leftColor} variant={b.leftVariant} size={38} />
                    <div>
                      <div className="text-sm font-bold text-white">{b.leftName}</div>
                      <div className="flex items-center gap-1 text-[11px] text-emerald-400"><span>🏆</span> Won</div>
                    </div>
                  </div>
                  <div className="text-xs font-black text-slate-500 flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>VS</div>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <BattleAvatar color={b.rightColor} variant={b.rightVariant} size={38} />
                    <div>
                      <div className="text-sm font-bold text-white">{b.rightName}</div>
                      <div className="flex items-center gap-1 text-[11px] text-red-400"><span>❤️</span> Lost</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="text-[11px] text-slate-500">{b.time}</div>
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                      🏆 {b.pts}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Leaderboard ── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2"><span className="text-lg">🏆</span><div className="text-base font-bold text-white">Leaderboard</div></div>
              <button onClick={() => setShowFullLeaderboard(true)} className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                View Full Leaderboard <Ico n="chevR" cls="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-end gap-3 px-5 pb-5">
              {LEADERBOARD_DATA.map((p, i) => (
                <div key={i} className={`flex-1 flex flex-col items-center gap-2.5 p-4 rounded-2xl border`}
                  style={{ background: p.isFirst ? 'linear-gradient(160deg,rgba(245,158,11,0.12),rgba(251,191,36,0.06))' : 'rgba(14,21,40,0.5)', borderColor: p.isFirst ? 'rgba(245,158,11,0.5)' : 'rgba(124,58,237,0.2)', boxShadow: p.isFirst ? '0 0 24px rgba(245,158,11,0.15)' : 'none' }}>
                  {p.isFirst && <span className="text-xl">👑</span>}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: p.rank === 1 ? 'rgba(255,215,0,0.2)' : p.rank === 2 ? 'rgba(192,192,192,0.15)' : 'rgba(205,127,50,0.15)', color: p.rank === 1 ? '#FFD700' : p.rank === 2 ? '#C0C0C0' : '#CD7F32', border: `1.5px solid ${p.rank === 1 ? '#FFD70060' : p.rank === 2 ? '#C0C0C060' : '#CD7F3260'}` }}>
                    {p.rank}
                  </div>
                  <BattleAvatar color={p.color} variant={p.variant} size={52} glow={p.isFirst} />
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{p.wins} wins · {p.streak} streak</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-4" />
        </main>
      </div>

      {/* ── Full Leaderboard Modal ── */}
      {showFullLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowFullLeaderboard(false) }}>
          <div className="rounded-2xl border p-7 w-[440px] max-h-[80vh] overflow-y-auto"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.45)', boxShadow: '0 0 60px rgba(124,58,237,0.2)' }}>
            <div className="text-center mb-5">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">RANKINGS</div>
              <div className="text-lg font-bold text-white">Full Leaderboard</div>
            </div>
            <div className="space-y-2">
              {[
                { rank: 1, name: 'Aryan', wins: 12, streak: 8, pts: 1240, color: '#F59E0B', variant: 1 },
                { rank: 2, name: 'Meera', wins: 10, streak: 6, pts: 1020, color: '#A855F7', variant: 2 },
                { rank: 3, name: 'Nain', wins: 8, streak: 5, pts: 850, color: '#3B82F6', variant: 3 },
                { rank: 4, name: 'You', wins: 5, streak: 3, pts: 620, color: '#7C3AED', variant: 0 },
                { rank: 5, name: 'Dev', wins: 4, streak: 2, pts: 480, color: '#06B6D4', variant: 3 },
                { rank: 6, name: 'Riya', wins: 3, streak: 1, pts: 310, color: '#EC4899', variant: 0 },
                { rank: 7, name: 'Arjun', wins: 2, streak: 0, pts: 200, color: '#22D3EE', variant: 1 },
              ].map(p => (
                <div key={p.rank} className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{ background: p.name === 'You' ? 'rgba(124,58,237,0.1)' : 'rgba(14,21,40,0.5)', borderColor: p.name === 'You' ? 'rgba(124,58,237,0.4)' : 'rgba(124,58,237,0.15)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ color: p.rank === 1 ? '#FFD700' : p.rank === 2 ? '#C0C0C0' : p.rank === 3 ? '#CD7F32' : '#64748B' }}>
                    {p.rank}
                  </div>
                  <BattleAvatar color={p.color} variant={p.variant} size={36} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{p.name}</div>
                    <div className="text-[10px] text-slate-400">{p.wins} wins · {p.streak} streak</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold" style={{ color: '#FFD700' }}>{p.pts}</div>
                    <div className="text-[10px] text-slate-500">pts</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowFullLeaderboard(false)}
              className="w-full mt-5 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
              style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Close</button>
          </div>
        </div>
      )}

      {/* ── All Trophies Modal ── */}
      {showAllTrophies && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAllTrophies(false) }}>
          <div className="rounded-2xl border p-7 w-[420px]"
            style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.45)', boxShadow: '0 0 60px rgba(124,58,237,0.2)' }}>
            <div className="text-center mb-5">
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1">TROPHIES</div>
              <div className="text-lg font-bold text-white">All Trophies & Rewards</div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[...TROPHY_TIERS,
                { label: '50 Wins', sub: '50 battles', tier: 'Platinum', emoji: '🏅', color: '#67E8F9', bg: 'rgba(103,232,249,0.08)', border: 'rgba(103,232,249,0.25)' },
                { label: '100 Wins', sub: '100 battles', tier: 'Legend', emoji: '⭐', color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.35)' },
              ].map(t => (
                <div key={t.tier} className="flex items-center gap-3 p-3.5 rounded-xl border"
                  style={{ background: t.bg, borderColor: t.border }}>
                  <span className="text-2xl">{t.emoji}</span>
                  <div>
                    <div className="text-xs font-bold text-white">{t.label}</div>
                    <div className="text-[9px] text-slate-400">{t.sub}</div>
                    <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded-full inline-block"
                      style={{ background: `${t.color}20`, color: t.color }}>{t.tier}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAllTrophies(false)}
              className="w-full py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
              style={{ borderColor: 'rgba(124,58,237,0.2)' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Settings Page ─────────────────────────────────────────────────────────────

function SettingsPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  type SettingsTab = 'profile' | 'account' | 'notifications' | 'privacy' | 'study' | 'about'

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [saved, setSaved] = useState(false)

  // Profile state
  const [avatarColor, setAvatarColor] = useState('#7C3AED')
  const [avatarEmoji, setAvatarEmoji] = useState('🎓')
  const [displayName, setDisplayName] = useState('Jatin Sinsinwar')
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

  const AVATAR_COLORS = ['#7C3AED', '#06B6D4', '#EC4899', '#34D399', '#F59E0B', '#3B82F6', '#A855F7', '#F87171']
  const AVATAR_EMOJIS = ['🎓', '⚡', '🔥', '🎯', '💡', '🚀', '📚', '🏆']

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
        style={{ background: val ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(100,116,139,0.35)', boxShadow: val ? '0 0 10px rgba(124,58,237,0.4)' : 'none' }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all"
          style={{ left: val ? 'calc(100% - 22px)' : '2px' }} />
      </button>
    )
  }

  function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
    return (
      <div className="flex items-center justify-between py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
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
      <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
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
      <div className="py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
        <div className="text-[10px] text-slate-500 font-mono mb-1.5">{label}</div>
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 transition-colors focus:border-violet-500/50"
          style={{ borderColor: 'rgba(124,58,237,0.25)' }} />
      </div>
    )
  }

  function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
    return (
      <div className="py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
        <div className="text-[10px] text-slate-500 font-mono mb-1.5">{label}</div>
        <div className="flex flex-wrap gap-2">
          {options.map(o => (
            <button key={o} onClick={() => onChange(o)}
              className="px-3.5 py-1.5 rounded-xl border text-sm font-medium transition-all"
              style={{ background: value === o ? 'rgba(124,58,237,0.2)' : 'rgba(14,21,40,0.5)', color: value === o ? '#C4B5FD' : '#64748B', borderColor: value === o ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)' }}>
              {o}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="settings" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>SETTINGS</div>
            <div className="text-sm font-semibold text-slate-200">Manage your account & preferences.</div>
          </div>
          {saved && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}>
              ✓ Changes saved
            </div>
          )}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: `linear-gradient(135deg,${avatarColor},#06B6D4)` }}>JS</div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Settings nav sidebar */}
          <div className="w-52 flex-shrink-0 border-r py-4 space-y-1 overflow-y-auto px-3"
            style={{ borderColor: 'rgba(124,58,237,0.15)', background: 'rgba(6,8,15,0.5)' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                style={{
                  background: activeTab === tab.id ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: activeTab === tab.id ? '#C4B5FD' : '#64748B',
                  border: `1px solid ${activeTab === tab.id ? 'rgba(124,58,237,0.35)' : 'transparent'}`,
                }}>
                <span className="text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            <div className="pt-4 mt-4 border-t px-1" style={{ borderColor: 'rgba(124,58,237,0.15)' }}>
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
                <div className="rounded-2xl border p-5" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
                  <div className="text-[10px] font-mono tracking-[0.18em] text-violet-400 mb-4">PROFILE PICTURE</div>
                  <div className="flex items-center gap-6">
                    {/* Big avatar preview */}
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: `linear-gradient(135deg,${avatarColor}40,${avatarColor}20)`, border: `2px solid ${avatarColor}60`, boxShadow: `0 0 24px ${avatarColor}30` }}>
                      {avatarEmoji}
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] text-slate-500 mb-2">Choose emoji</div>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {AVATAR_EMOJIS.map(e => (
                          <button key={e} onClick={() => setAvatarEmoji(e)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all hover:scale-110 border"
                            style={{ background: avatarEmoji === e ? 'rgba(124,58,237,0.2)' : 'rgba(14,21,40,0.5)', borderColor: avatarEmoji === e ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)' }}>
                            {e}
                          </button>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-500 mb-2">Choose color</div>
                      <div className="flex gap-2">
                        {AVATAR_COLORS.map(c => (
                          <button key={c} onClick={() => setAvatarColor(c)}
                            className="w-7 h-7 rounded-full border-2 transition-all hover:scale-110"
                            style={{ background: c, borderColor: avatarColor === c ? '#fff' : 'transparent' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <SectionCard title="PERSONAL INFORMATION">
                  <FieldInput label="DISPLAY NAME" value={displayName} onChange={setDisplayName} placeholder="Your full name" />
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
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
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
                  <div className="py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">CURRENT PASSWORD</div>
                    <input type="password" placeholder="Enter current password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} />
                  </div>
                  <div className="py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">NEW PASSWORD</div>
                    <input type="password" placeholder="Enter new password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} />
                  </div>
                  <div className="py-3.5">
                    <div className="text-[10px] text-slate-500 font-mono mb-1.5">CONFIRM NEW PASSWORD</div>
                    <input type="password" placeholder="Confirm new password"
                      className="w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                      style={{ borderColor: 'rgba(124,58,237,0.25)' }} />
                  </div>
                </SectionCard>

                <SectionCard title="CONNECTED ACCOUNTS">
                  {[
                    { name: 'Google', icon: '🔵', connected: true },
                    { name: 'Discord', icon: '🟣', connected: false },
                    { name: 'GitHub', icon: '⚫', connected: false },
                  ].map(acc => (
                    <div key={acc.name} className="flex items-center justify-between py-3.5 border-b last:border-0" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.icon}</span>
                        <div>
                          <div className="text-sm font-medium text-slate-200">{acc.name}</div>
                          <div className="text-[11px]" style={{ color: acc.connected ? '#34D399' : '#64748B' }}>{acc.connected ? 'Connected' : 'Not connected'}</div>
                        </div>
                      </div>
                      <button className="px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all hover:border-violet-500/40"
                        style={{ borderColor: 'rgba(124,58,237,0.25)', color: acc.connected ? '#F87171' : '#A78BFA' }}>
                        {acc.connected ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  ))}
                </SectionCard>

                <button onClick={saveProfile}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
                  Save Account Changes
                </button>

                <div className="rounded-2xl border p-5" style={{ background: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.2)' }}>
                  <div className="text-[10px] font-mono tracking-[0.18em] text-red-400 mb-3">DANGER ZONE</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-red-300">Delete Account</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Permanently delete your Wynko account and all data.</div>
                    </div>
                    <button className="px-4 py-2 rounded-xl text-[12px] font-bold text-red-400 border transition-all hover:bg-red-500/10"
                      style={{ borderColor: 'rgba(239,68,68,0.35)' }}>Delete</button>
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
                    <div key={item.label} className="flex items-center justify-between py-3.5 border-b last:border-0" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{item.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{item.sub}</div>
                      </div>
                      <button className="px-3.5 py-1.5 rounded-xl border text-[11px] font-semibold text-violet-400 hover:border-violet-500/50 transition-all"
                        style={{ borderColor: 'rgba(124,58,237,0.3)' }}>{item.action}</button>
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
                  <div className="py-3.5 border-b" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                    <div className="text-[10px] text-slate-500 font-mono mb-2">DAILY STUDY GOAL (HOURS)</div>
                    <div className="flex gap-2 flex-wrap">
                      {['2', '4', '6', '8', '10', '12'].map(h => (
                        <button key={h} onClick={() => setDailyGoal(h)}
                          className="px-4 py-2 rounded-xl border text-sm font-semibold transition-all"
                          style={{ background: dailyGoal === h ? 'rgba(124,58,237,0.2)' : 'rgba(14,21,40,0.5)', color: dailyGoal === h ? '#C4B5FD' : '#64748B', borderColor: dailyGoal === h ? 'rgba(124,58,237,0.5)' : 'rgba(124,58,237,0.15)' }}>
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
                    <div key={t.name} className="flex items-center justify-between py-3.5 border-b last:border-0" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{t.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{t.sub}</div>
                      </div>
                      <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: i === 0 ? '#7C3AED' : 'rgba(124,58,237,0.3)' }}>
                        {i === 0 && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                      </div>
                    </div>
                  ))}
                </SectionCard>
                <button onClick={saveProfile}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}>
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
                <div className="rounded-2xl border p-8 text-center" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 32px rgba(124,58,237,0.4)' }}>W</div>
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
                    <button key={item.label} className="w-full flex items-center justify-between py-3.5 border-b last:border-0 text-left group" style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
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

function WynkoinsPage({ onNavigate }: { onNavigate: (id: string) => void }) {
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
      badge: '', color: '#7C3AED', glow: 'rgba(124,58,237,0.4)',
      grad: 'linear-gradient(135deg,#7C3AED,#5B21B6)',
      perCoin: '14.6p/coin', popular: false,
    },
    {
      id: 'pack_399', coins: 399, price: '₹49', priceNum: 49,
      badge: 'BEST VALUE', color: '#06B6D4', glow: 'rgba(6,182,212,0.4)',
      grad: 'linear-gradient(135deg,#0891B2,#0E7490)',
      perCoin: '12.3p/coin', popular: true,
    },
  ]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#06080F', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="wynkoins" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: 'rgba(6,8,15,0.95)', borderColor: 'rgba(124,58,237,0.15)' }}>
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: 'JetBrains Mono, monospace' }}>WYNKOINS</div>
            <div className="text-sm font-semibold text-slate-200">Buy coins. Unlock perks.</div>
          </div>
          {/* Balance pill */}
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border"
            style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.35)' }}>
            <img src="/wynkoin.png" alt="Wynkoin" className="w-5 h-5 object-contain flex-shrink-0" />
            <span className="text-base font-black text-amber-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{balance}</span>
            <span className="text-[10px] text-amber-600 font-semibold">WYNKOINS</span>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#06B6D4)' }}>JS</div>
        </header>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-2xl transition-all"
            style={{
              background: toast.type === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${toast.type === 'success' ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.4)'}`,
              color: toast.type === 'success' ? '#34D399' : '#F87171',
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
                <div className="text-5xl font-black text-amber-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{balance}</div>
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
                      style={{ borderColor: pack.popular ? pack.color + '60' : 'rgba(124,58,237,0.25)', background: '#0A0D1E', boxShadow: pack.popular ? `0 0 32px ${pack.glow}` : 'none' }}>
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
                            🪙
                          </div>
                          <div>
                            <div className="text-3xl font-black text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{pack.coins}</div>
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
                <div className="rounded-2xl border overflow-hidden" style={{ background: '#0A0D1E', borderColor: adsFree ? 'rgba(52,211,153,0.4)' : 'rgba(124,58,237,0.25)' }}>
                  {adsFree && <div className="h-0.5" style={{ background: 'linear-gradient(90deg,#34D399,#059669)' }} />}
                  <div className="p-6 flex items-center gap-5">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ background: adsFree ? 'rgba(52,211,153,0.12)' : 'rgba(124,58,237,0.12)', border: `1.5px solid ${adsFree ? 'rgba(52,211,153,0.4)' : 'rgba(124,58,237,0.3)'}` }}>
                      🚫
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-base font-black text-white">Remove Ads</div>
                        {adsFree && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399', border: '1px solid rgba(52,211,153,0.3)' }}>ACTIVE</span>}
                      </div>
                      <div className="text-sm text-slate-400 mb-2">Enjoy Wynko completely ad-free for <span className="text-white font-semibold">1 full month</span>.</div>
                      {adsFree && adsFreeExpiry && (
                        <div className="text-[11px] font-mono text-emerald-400">Ad-free active until {adsFreeExpiry}</div>
                      )}
                      {!adsFree && (
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-black text-lg" style={{ fontFamily: 'JetBrains Mono, monospace' }}>199</span>
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
                          background: balance >= 199 ? 'linear-gradient(135deg,#7C3AED,#4F46E5)' : 'rgba(30,30,50,0.8)',
                          color: balance >= 199 ? '#fff' : '#475569',
                          border: balance >= 199 ? 'none' : '1px solid rgba(124,58,237,0.2)',
                          boxShadow: balance >= 199 ? '0 0 20px rgba(124,58,237,0.35)' : 'none',
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
                      style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.15)', borderStyle: 'dashed' }}>
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
              <div className="rounded-2xl border p-5" style={{ background: '#0A0D1E', borderColor: 'rgba(245,158,11,0.35)' }}>
                <div className="text-[10px] font-mono tracking-[0.2em] text-amber-500 mb-3">WALLET</div>
                <div className="flex items-end gap-2 mb-1">
                  <div className="text-5xl font-black text-amber-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{balance}</div>
                  <div className="text-[11px] text-amber-600 mb-2">WYNKOINS</div>
                </div>
                <div className="w-full rounded-full h-2 mb-3" style={{ background: 'rgba(245,158,11,0.12)' }}>
                  <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (balance / 500) * 100)}%`, background: 'linear-gradient(90deg,#F59E0B,#D97706)' }} />
                </div>
                <div className="text-[10px] text-slate-600 mb-4">{balance < 199 ? `${199 - balance} more coins needed to remove ads` : 'Enough to remove ads!'}</div>
                {adsFree && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border mb-3"
                    style={{ background: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.3)' }}>
                    <span>🚫</span>
                    <div className="text-[11px] text-emerald-400 font-semibold">Ad-free until {adsFreeExpiry}</div>
                  </div>
                )}
                <button onClick={() => onNavigate('earn')} className="w-full py-2 rounded-xl border text-[12px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-all"
                  style={{ borderColor: 'rgba(124,58,237,0.3)' }}>
                  Earn free WYNKOINS →
                </button>
              </div>

              {/* Transaction history */}
              <div className="rounded-2xl border p-5" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.22)' }}>
                <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">TRANSACTION HISTORY</div>
                {history.length === 0 ? (
                  <div className="text-center py-6 text-slate-600 text-[12px]">No transactions yet</div>
                ) : (
                  <div className="space-y-0">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0"
                        style={{ borderColor: 'rgba(124,58,237,0.1)' }}>
                        <div>
                          <div className="text-[12px] font-medium text-slate-300">{h.label}</div>
                          <div className="text-[10px] text-slate-600 font-mono">{h.date}</div>
                        </div>
                        <div className="text-sm font-black" style={{ color: h.type === 'credit' ? '#34D399' : '#F87171', fontFamily: 'JetBrains Mono, monospace' }}>
                          {h.type === 'credit' ? '+' : '−'}{h.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* How to earn free */}
              <div className="rounded-2xl border p-5" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.18)' }}>
                <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">EARN FREE WYNKOINS</div>
                <div className="space-y-2.5">
                  {[
                    { icon: '🎁', label: 'Invite a friend', sub: '+50 coins after their 3-day streak' },
                    { icon: '🔥', label: 'Daily study streak', sub: 'Coming soon' },
                    { icon: '👑', label: 'WynkoHead community', sub: 'Earn from referrals' },
                  ].map(e => (
                    <div key={e.label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>{e.icon}</div>
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

function EarnPage({ onNavigate }: { onNavigate: (id: string) => void }) {
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
      { name: "Komal Singh", code: "WYNKO-KOMAL-HEAD", members: 7, revenue: "₹9,600", myShare: "₹960", avatar: "#6366F1", init: "KS" },
    ]

    return (
      <div className="flex h-screen overflow-hidden" style={{ background: "#06080F", fontFamily: "Poppins, sans-serif" }}>
        <Sidebar active="earn" setActive={onNavigate} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
            style={{ background: "rgba(6,8,15,0.95)", borderColor: "rgba(124,58,237,0.15)" }}>
            <button onClick={() => setInLibrary(false)} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
              <Ico n="chevL" cls="w-4 h-4" /> Back
            </button>
            <div className="flex-1">
              <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: "JetBrains Mono, monospace" }}>WYNKOHEAD LIBRARY</div>
              <div className="text-sm font-semibold text-slate-200">Your community dashboard</div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" }}>
              <span className="text-base">🪙</span>
              <span className="text-sm font-bold text-amber-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>{wynkoins}</span>
              <span className="text-[10px] text-amber-500">WYNKOINS</span>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)" }}>JS</div>
          </header>

          <main className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex gap-5 items-start max-w-5xl">
              {/* Left */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* Share link */}
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.3)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">YOUR WYNKOHEAD INVITE LINK</div>
                  <div className="text-[11px] text-slate-500 mb-3">Share this link — anyone who joins Wynko via this link is added to your community.</div>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3" style={{ background: "rgba(14,21,40,0.6)", borderColor: "rgba(124,58,237,0.25)" }}>
                    <span className="text-violet-400">🔗</span>
                    <span className="text-sm text-slate-200 flex-1 font-bold truncate" style={{ fontFamily: "JetBrains Mono, monospace" }}>{wynkoHeadLink}</span>
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400">YOUR COMMUNITY</div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ color: "#A78BFA", background: "rgba(124,58,237,0.1)", borderColor: "rgba(124,58,237,0.3)" }}>{communityMembers.length} members</span>
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
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "rgba(14,21,40,0.5)", borderColor: "rgba(124,58,237,0.12)" }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)" }}>
                            {m.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-slate-200">{m.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">Joined {m.joined}</div>
                          </div>
                          <div className="px-2 py-0.5 rounded-full text-[9px] font-bold border" style={{ color: "#34D399", background: "rgba(52,211,153,0.1)", borderColor: "rgba(52,211,153,0.3)" }}>ACTIVE</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dev helper: simulate a user joining */}
                  <div className="mt-4 pt-4 border-t flex gap-2 items-center" style={{ borderColor: "rgba(124,58,237,0.1)" }}>
                    <div className="text-[9px] text-slate-600 flex-shrink-0 font-mono">SIMULATE JOIN (DEMO)</div>
                    <input value={simName} onChange={e => setSimName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addSimMember()}
                      placeholder="Enter a name to simulate..."
                      className="flex-1 px-3 py-1.5 rounded-lg border bg-transparent text-[11px] text-slate-300 outline-none placeholder-slate-700"
                      style={{ borderColor: "rgba(124,58,237,0.2)" }} />
                    <button onClick={addSimMember}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-violet-300 border hover:border-violet-500/50 transition-all"
                      style={{ borderColor: "rgba(124,58,237,0.3)" }}>Add</button>
                  </div>
                </div>

                {/* Sub WynkoHeads */}
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-cyan-400 mb-1">SUB-WYNKOHEADS</div>
                  <div className="text-[11px] text-slate-500 mb-3">Share your WynkoHead code. If another creator registers as WynkoHead using your code, you earn 10% from their community revenue.</div>

                  {/* Share code */}
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-4" style={{ background: "rgba(14,21,40,0.6)", borderColor: "rgba(34,211,238,0.25)" }}>
                    <span className="text-cyan-400">👑</span>
                    <span className="text-sm font-bold text-slate-200 flex-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>{subHeadCode}</span>
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
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: "rgba(6,182,212,0.04)", borderColor: "rgba(34,211,238,0.15)" }}>
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
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
                      <div key={ex.label} className="flex-1 p-3.5 rounded-xl border" style={{ background: "rgba(124,58,237,0.05)", borderColor: "rgba(124,58,237,0.18)" }}>
                        <div className="text-xl mb-2">{ex.icon}</div>
                        <div className="text-[11px] font-bold text-slate-300 mb-0.5">{ex.label}</div>
                        <div className="text-[10px] text-slate-500">{ex.price} · {ex.note}</div>
                        <div className="mt-2 pt-2 border-t text-[11px]" style={{ borderColor: "rgba(124,58,237,0.15)" }}>
                          You earn: <span className="font-bold" style={{ color: "#34D399" }}>{ex.earn}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right sidebar — earnings */}
              <div className="w-68 flex-shrink-0 space-y-4" style={{ width: "268px" }}>
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.3)" }}>
                  <div className="flex items-center gap-2 mb-4">
                    <span>👑</span>
                    <span className="text-sm font-bold text-white">Your Earnings</span>
                    <span className="text-[9px] text-amber-500 ml-1">[EXAMPLE]</span>
                  </div>
                  <div className="text-4xl font-black text-white mb-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>{totalEarned}</div>
                  <div className="text-[10px] text-amber-500 mb-3 font-mono">EXAMPLE — grows as your community grows</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.2)" }}>
                      <div className="flex items-center gap-2"><span>⏱️</span><span className="text-[11px] text-slate-400">Pending confirmation</span></div>
                      <span className="text-sm font-bold text-amber-400">{pending}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.2)" }}>
                      <div className="flex items-center gap-2"><span>💳</span><span className="text-[11px] text-slate-400">Available to withdraw</span></div>
                      <span className="text-sm font-bold text-emerald-400">{available}</span>
                    </div>
                  </div>
                  <button className="w-full mt-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)", boxShadow: "0 0 16px rgba(124,58,237,0.3)" }}>
                    Withdraw Earnings
                  </button>
                </div>

                {/* WYNKOINS */}
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(245,158,11,0.3)" }}>
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">🪙</span><span className="text-sm font-bold text-white">WYNKOINS</span></div>
                  <div className="text-4xl font-black text-amber-400 mb-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>{wynkoins}</div>
                  <div className="text-[11px] text-slate-500 mb-3">Earned from friend invites</div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { label: "Friend streak bonus", coins: "+50 (EXAMPLE)", color: "#34D399" },
                      { label: "Welcome bonus", coins: "+100 (REAL)", color: "#A78BFA" },
                    ].map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "rgba(245,158,11,0.1)" }}>
                        <span className="text-slate-400">{e.label}</span>
                        <span className="font-bold" style={{ color: e.color }}>{e.coins}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-4 py-2 rounded-xl text-amber-400 text-[12px] font-semibold border transition-all hover:bg-amber-500/10"
                    style={{ borderColor: "rgba(245,158,11,0.3)" }}>Redeem WYNKOINS</button>
                </div>

                <div className="rounded-2xl border p-4" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">COMMUNITY STATS</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Members", val: String(communityMembers.length), color: "#C4B5FD" },
                      { label: "Sub-WynkoHeads", val: "0", color: "#67E8F9" },
                    ].map(s => (
                      <div key={s.label} className="p-3 rounded-xl border text-center" style={{ borderColor: "rgba(124,58,237,0.15)", background: "rgba(14,21,40,0.4)" }}>
                        <div className="text-xl font-black" style={{ color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.val}</div>
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
    <div className="flex h-screen overflow-hidden" style={{ background: "#06080F", fontFamily: "Poppins, sans-serif" }}>
      <Sidebar active="earn" setActive={onNavigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0"
          style={{ background: "rgba(6,8,15,0.95)", borderColor: "rgba(124,58,237,0.15)" }}>
          <button onClick={() => onNavigate("home")} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5" style={{ fontFamily: "JetBrains Mono, monospace" }}>EARN WITH WYNKO</div>
            <div className="text-sm font-semibold text-slate-200">Build your community. Share the revenue.</div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ background: "rgba(245,158,11,0.1)", borderColor: "rgba(245,158,11,0.3)" }}>
            <span className="text-base">🪙</span>
            <span className="text-sm font-bold text-amber-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>{wynkoins}</span>
            <span className="text-[10px] text-amber-500">WYNKOINS</span>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)" }}>JS</div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* Hero — no revenue split visual */}
          <div className="relative overflow-hidden px-8 py-8" style={{ background: "linear-gradient(130deg,#080B1A 0%,#12083A 55%,#080B1A 100%)", borderBottom: "1px solid rgba(124,58,237,0.2)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 60% 50%,rgba(124,58,237,0.22),transparent 65%)" }} />
            <div className="relative z-10">
              <div className="text-[10px] font-mono tracking-[0.28em] text-violet-400 mb-3">EARN WITH WYNKO</div>
              <h1 className="text-3xl font-black text-white leading-tight mb-1">Become a <span style={{ background: "linear-gradient(135deg,#7C3AED,#06B6D4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>WynkoHead.</span></h1>
              <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-5">Build your own community of students on Wynko. Earn 50% revenue share on every purchase your students make. Grow your network — earn from your network's WynkoHeads too. Or simply invite friends and earn WYNKOINS together.</p>
              <div className="flex gap-6 flex-wrap">
                {[
                  { icon: "👑", v: "50%", label: "Revenue from your community" },
                  { icon: "🔗", v: "10%", label: "From Sub-WynkoHead revenue" },
                  { icon: "🪙", v: "WYNKOINS", label: "For every friend who hits 3-day streak" },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.35)" }}>{f.icon === "🪙" ? <img src="/wynkoin.png" alt="Wynkoin" className="w-6 h-6 object-contain" /> : f.icon}</div>
                    <div>
                      <div className="text-base font-black" style={{ background: "linear-gradient(135deg,#C4B5FD,#67E8F9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{f.v}</div>
                      <div className="text-[10px] text-slate-500">{f.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 px-6 py-3 border-b" style={{ borderColor: "rgba(124,58,237,0.12)" }}>
            {([
              { id: "wynkohead" as EarnTab, icon: "👑", label: "WynkoHead Program" },
              { id: "invite" as EarnTab, icon: "🎁", label: "Invite a Friend" },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: tab === t.id ? "rgba(124,58,237,0.15)" : "transparent",
                  color: tab === t.id ? "#C4B5FD" : "#64748B",
                  border: "1px solid " + (tab === t.id ? "rgba(124,58,237,0.35)" : "transparent"),
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-4">HOW WYNKOHEAD WORKS</div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { n: "1", icon: "📣", title: "Invite Students", desc: "Share your WynkoHead link. Students who join Wynko via your link become part of your community." },
                      { n: "2", icon: "🛒", title: "They Purchase", desc: "Any time a community student buys a plan, pack, or merch — you automatically get 50% of the revenue." },
                      { n: "3", icon: "🔗", title: "Grow Sub-WynkoHeads", desc: "Share your WynkoHead code to other creators. When they register using it, you earn 10% from their community revenue too." },
                    ].map(s => (
                      <div key={s.n} className="p-4 rounded-xl border" style={{ background: "rgba(124,58,237,0.05)", borderColor: "rgba(124,58,237,0.18)" }}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)" }}>{s.n}</div>
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
                  <div className="rounded-2xl border overflow-hidden" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.35)" }}>
                    {!registering ? (
                      <div className="p-6 flex items-center justify-between gap-6">
                        <div>
                          <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">READY TO START?</div>
                          <div className="text-lg font-black text-white mb-1">Register as a WynkoHead</div>
                          <div className="text-[12px] text-slate-400">Unlock your community dashboard, share your invite link, and start earning 50% revenue share.</div>
                        </div>
                        <button onClick={() => setRegistering(true)}
                          className="flex-shrink-0 px-6 py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.03]"
                          style={{ background: "linear-gradient(135deg,#7C3AED,#4F46E5)", boxShadow: "0 0 28px rgba(124,58,237,0.45)" }}>
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
                              className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                              style={{ borderColor: "rgba(124,58,237,0.3)" }} />
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 mb-1.5">PHONE / SOCIAL HANDLE (optional)</div>
                            <input value={regPhone} onChange={e => setRegPhone(e.target.value)}
                              placeholder="+91 or @handle"
                              className="w-full px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors"
                              style={{ borderColor: "rgba(124,58,237,0.3)" }} />
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button onClick={() => setRegistering(false)}
                              className="px-4 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors"
                              style={{ borderColor: "rgba(124,58,237,0.2)" }}>Cancel</button>
                            <button onClick={handleRegister}
                              className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
                              style={{ background: regName.trim() ? "linear-gradient(135deg,#7C3AED,#4F46E5)" : "rgba(14,21,40,0.7)", opacity: regName.trim() ? 1 : 0.5 }}>
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
                    style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.18),rgba(79,70,229,0.12))", borderColor: "rgba(124,58,237,0.45)", boxShadow: "0 0 32px rgba(124,58,237,0.12)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "rgba(124,58,237,0.25)", border: "1px solid rgba(124,58,237,0.5)" }}>👑</div>
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-4">HOW FRIEND INVITES WORK</div>
                  <div className="flex gap-4">
                    {[
                      { icon: "🔗", title: "Share Your Link", desc: "Copy your unique invite link and send it to a friend." },
                      { icon: "🎓", title: "Friend Joins", desc: "Your friend signs up on Wynko using your link." },
                      { icon: "🔥", title: "3-Day Streak", desc: "They study for 3 consecutive days on Wynko." },
                      { icon: "🪙", title: "Both Get WYNKOINS", desc: "You and your friend each receive WYNKOINS instantly!" },
                    ].map((s, i) => (
                      <div key={i} className="flex-1 p-3.5 rounded-xl border text-center" style={{ background: "rgba(124,58,237,0.05)", borderColor: "rgba(124,58,237,0.18)" }}>
                        <div className="text-2xl mb-2 flex justify-center">{s.icon === "🪙" ? <img src="/wynkoin.png" alt="Wynkoin" className="w-7 h-7 object-contain" /> : s.icon}</div>
                        <div className="text-[12px] font-bold text-white mb-1">{s.title}</div>
                        <div className="text-[10px] text-slate-400 leading-relaxed">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-4 p-4 rounded-xl border" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)" }}>
                    <span className="text-3xl">🪙</span>
                    <div>
                      <div className="text-sm font-bold text-amber-300">WYNKOINS Reward</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">After your friend completes their 3-day streak — <span className="text-amber-400 font-bold">you get 50 WYNKOINS</span> and <span className="text-amber-400 font-bold">they get 50 WYNKOINS</span> too.</div>
                    </div>
                  </div>
                </div>

                {/* Referral link */}
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.3)" }}>
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">YOUR INVITE LINK</div>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3" style={{ background: "rgba(14,21,40,0.6)", borderColor: "rgba(124,58,237,0.25)" }}>
                    <span className="text-violet-400">🔗</span>
                    <span className="text-sm text-slate-200 flex-1 font-bold" style={{ fontFamily: "JetBrains Mono, monospace" }}>{friendLink}</span>
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(124,58,237,0.22)" }}>
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
                <div className="rounded-2xl border p-5" style={{ background: "#0A0D1E", borderColor: "rgba(245,158,11,0.3)" }}>
                  <div className="flex items-center gap-2 mb-3"><span className="text-xl">🪙</span><span className="text-sm font-bold text-white">Your WYNKOINS</span></div>
                  <div className="text-4xl font-black text-amber-400 mb-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>{wynkoins}</div>
                  <div className="text-[11px] text-slate-500 mb-3">Earned from friend invites and bonuses</div>
                  <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono" style={{ background: "rgba(245,158,11,0.07)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.2)" }}>
                    ⚠ BREAKDOWN BELOW IS FOR EXAMPLE — YOUR REAL HISTORY WILL APPEAR AS YOU INVITE FRIENDS
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { label: "Friend streak bonus (EXAMPLE)", coins: "+50", color: "#34D399" },
                      { label: "Welcome bonus (REAL)", coins: "+100", color: "#A78BFA" },
                    ].map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "rgba(245,158,11,0.1)" }}>
                        <span className="text-slate-400">{e.label}</span>
                        <span className="font-bold" style={{ color: e.color }}>{e.coins}</span>
                      </div>
                    ))}
                  </div>
                  <button className="w-full mt-4 py-2 rounded-xl text-amber-400 text-[12px] font-semibold border transition-all hover:bg-amber-500/10"
                    style={{ borderColor: "rgba(245,158,11,0.3)" }}>Redeem WYNKOINS</button>
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

function LibraryPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active="3dlibrary" setActive={onNavigate} />
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
            style={{ background: 'rgba(124,58,237,0.25)', border: '1.5px solid rgba(124,58,237,0.5)', boxShadow: '0 0 48px rgba(124,58,237,0.35)', backdropFilter: 'blur(8px)' }}>
            🏛️
          </div>
          {/* Label */}
          <div className="text-[11px] font-mono tracking-[0.3em] text-violet-400">3D LIBRARY</div>
          {/* Heading */}
          <h1 className="text-6xl font-black text-white leading-tight"
            style={{ textShadow: '0 0 60px rgba(124,58,237,0.8), 0 0 120px rgba(124,58,237,0.4)', letterSpacing: '-0.02em' }}>
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
                style={{ background: 'rgba(124,58,237,0.15)', borderColor: 'rgba(124,58,237,0.4)', color: '#C4B5FD', backdropFilter: 'blur(8px)' }}>
                {f}
              </div>
            ))}
          </div>
          {/* Notify button */}
          <button className="mt-2 flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-white text-base transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)', boxShadow: '0 0 32px rgba(124,58,237,0.5)', backdropFilter: 'blur(8px)' }}>
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

  // Home's real data — everything else on this page (Focus Lock,
  // Schedules, Study Rooms, Battleground, Settings, Wynkoins, Earn,
  // Library) still runs on the local mock state above until their
  // own module pass.
  const { authState, reviewItems, loading: homeLoading, addUnit, removeUnitBySubject, markAsReviewed } = useHomeData()

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

  if (activeNav === 'focus') {
    return <FocusLockPage units={sharedUnits} onNavigate={handleNav} />
  }
  if (activeNav === 'schedules') {
    return <SchedulesPage onNavigate={handleNav} schedule={schedule} setSchedule={setSchedule} sharedUnits={sharedUnits} setSharedUnits={setSharedUnits} />
  }
  if (activeNav === 'battleground') {
    return <BattlegroundPage onNavigate={handleNav} />
  }
  if (activeNav === '3dlibrary') {
    return <LibraryPage onNavigate={handleNav} />
  }
  if (activeNav === 'wynkoins') {
    return <WynkoinsPage onNavigate={handleNav} />
  }
  if (activeNav === 'earn') {
    return <EarnPage onNavigate={handleNav} />
  }
  if (activeNav === 'settings') {
    return <SettingsPage onNavigate={handleNav} />
  }
  if (activeNav === 'studyrooms') {
    if (activeRoom) {
      return <RoomInteriorPage room={activeRoom} onBack={() => setActiveRoom(null)} onNavigate={handleNav} />
    }
    return <StudyRoomsPage onNavigate={handleNav} onEnterRoom={room => setActiveRoom(room)} />
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
  const topSubject = reviewItems.length > 0 ? `${reviewItems[0].subject.toUpperCase()} · ${reviewItems[0].topic}` : ''

  // Today's already-logged entries, shown as removable chips in
  // QuickAddUnit — derived from real reviewItems (daysAgo === 0)
  // rather than tracked as separate local state.
  const todaysUnits: StudyUnit[] = reviewItems
    .filter(i => i.daysAgo === 0)
    .map(i => ({ subject: i.subject, exam: '', topics: [i.topic] }))

  return (
    <div className="flex h-screen overflow-hidden text-slate-200" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
      <Sidebar active={activeNav} setActive={handleNav} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
          <TodayHero onGoFocus={goFocus} atRisk={atRisk} due={due} stable={stable} topSubject={topSubject} />
          <QuickActions onGoFocus={goFocus} onNavigate={handleNav} />
          <QuickAddUnit added={todaysUnits} onAdd={handleAddUnit} onRemove={handleRemoveUnit} />
          <div className="grid gap-3.5" style={{ gridTemplateColumns: '3fr 2fr' }}>
            <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <ReviewQueue items={reviewItems} onDismiss={markAsReviewed} />
            </div>
            <div className="p-4 rounded-2xl border" style={{ background: '#0A0D1E', borderColor: 'rgba(124,58,237,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <FocusPanel onGoFocus={goFocus} />
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


