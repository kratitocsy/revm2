import { useState, useRef, useEffect, useMemo, createContext, useContext } from 'react'
import libraryBg from './imports/Screenshot_2026_0908_032315.png'
import wynkoMascot from './imports/wynko-mascot.png'
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
import { useHomeData, type TodayFocus, type ProfileInfo, type WeeklyStudyDay } from './lib/useHomeData'
import { useFocusSession } from '../_shared/useFocusSession'
import {
  usePomodoroSettings, getPomodoroSettings, pomodoroSummaryLabel, POMODORO_LIMITS,
  type PomodoroSettings, type PomodoroSettingsInput,
} from '../_shared/pomodoroSettings'
import { useTimerMode, getTimerMode, setTimerMode } from '../_shared/timerModeSettings'
import type { ReviewItem, MultiRecallCurveData } from '../_shared/wynkoTracker'
import { Store } from '../../lib/storage'
import {
  useLoader, useRealtimeRefresh, fetchMyCommunities, fetchDiscoverCommunities, fetchMyCommunitySchedules, fetchMyWynkoHeadStatus,
  joinCommunity, leaveCommunity, setHomeCommunity, parseInviteInput, fetchCommunityDetail, fetchAnnouncements, setScheduleChoice,
  applyAsWynkoHead, createCommunity, publishCommunitySchedule, loadScheduleDraft, saveScheduleDraft, fetchHeadOverview,
  fetchStudentAnalytics, fetchJoinRequests, decideJoinRequest, updateCommunitySettings, postAnnouncement, deleteAnnouncement,
  communityInviteLink, fetchEarningsLedger, fetchPayoutHistory, fetchWalletBalance, requestPayout,
  type MyCommunity, type DiscoverCommunity, type CommunityScheduleRow, type CommunityDetailData, type CommunityAnnouncementRow,
  type WynkoHeadStatus, type ScheduleChoice, type StudentAnalyticsRow, type JoinRequestRow,
} from './lib/communities'
import {
  initStudyPlanSync, getPlanSnapshot, setPlanSnapshot, subscribePlan, setStudyWeek, useStudyPlanStore, mergeRemotePlan,
  getQuickNotes, setQuickNotes,
  type TimerMode, type PomodoroPhase, type StudyTask, type FocusPlanSnapshot, type ScheduleItem, type StudyUnit,
} from './lib/studyPlanStore'
import { logStudyTime, flushStudyTimeQueue, QUICK_TIMER_SUBJECT } from '../_shared/studyTimeLog'
import { PAUSE_REFLECTION_MIN_WORDS, countReflectionWords, isPauseUnlocked } from './lib/pauseReflection'
import {
  useStudyRooms, useRoomLive, joinRoom, leaveRoom, createRoom, kickMember, sendRoomMessage, roomInviteLink,
  type RoomRow, type RoomMember,
} from './lib/studyRooms'

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
  megaphone: ['M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46'],
  calendar: ['M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'],
  bullseye: ['M21 12a9 9 0 11-18 0 9 9 0 0118 0z', 'M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z', 'M12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z'],
  alert: ['M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'],
  pin: ['M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z'],
  dots: ['M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z'],
  close: ['M6 18L18 6M6 6l12 12'],
  send: ['M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5'],
  copy: ['M8 7h8a2 2 0 012 2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V9a2 2 0 012-2z', 'M16 7V5a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h2'],
  trash: ['M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0l-.8 12a2 2 0 01-2 2H9.8a2 2 0 01-2-2L7 7M10 11v6M14 11v6'],
}

function Ico({ n, cls = 'w-4 h-4', style }: { n: keyof typeof IP; cls?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={cls} style={style}>
      {IP[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  { id: 'studyrooms', label: 'Community', icon: 'rooms' as const, group: 'STUDY' },
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
      <button className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors">
        <Ico n="bell" cls="w-5 h-5" />
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" style={{ boxShadow: '0 0 6px rgba(155,108,255,0.8)' }} />
      </button>
      <UserAvatar size={32} className="cursor-pointer" />
    </header>
  )
}

// ─── Study Progress ───────────────────────────────────────────────────────────
// Replaces the old "Memory at Risk" hero as the first block on Home. Built to
// match the reference design pixel-for-pixel in spirit: deep navy card with a
// subtle blue gradient, thin electric-blue border + soft outer glow, a
// violet→royal-blue→cyan curved line with its own glow, a faint gradient fill
// beneath it, and a brighter cyan glow on today's point. Everything plotted
// (the three stats + all 7 points) comes from weeklyStudy/totalWeekMinutes/
// avgWeekMinutes in useHomeData — real per-day totals from study_log, the
// same column tracker.html/timer.html write to. Nothing here is hardcoded.
function formatStudyDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}m`
}

// Catmull-Rom → cubic-bezier conversion so the line is a smooth curve
// through every point rather than sharp angular segments.
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

// Whole-hour Y-axis ticks for the study-hours scale, derived straight from
// the same maxMinutes the curve itself is plotted against — so a tick's
// y position always lines up with where that many hours would fall on the
// existing curve (no change to how the curve/points are computed).
function buildHourTicks(maxMinutes: number, padTop: number, chartH: number): { hours: number; y: number }[] {
  const maxHours = Math.ceil(maxMinutes / 60)
  const step = maxHours > 6 ? Math.ceil(maxHours / 6) : 1
  const ticks: number[] = []
  for (let h = 0; h <= maxHours; h += step) ticks.push(h)
  if (ticks[ticks.length - 1] !== maxHours) ticks.push(maxHours)
  return ticks.map(h => ({
    hours: h,
    y: Math.max(padTop, padTop + (1 - (h * 60) / maxMinutes) * chartH),
  }))
}

function StudyProgress({ weeklyStudy, totalMinutes, avgMinutes, streakDays }: {
  weeklyStudy: WeeklyStudyDay[]; totalMinutes: number; avgMinutes: number; streakDays: number
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // Original curve geometry — untouched. padX/H/stepX/pts are computed
  // exactly as before, so the curve's shape and point spacing don't change.
  const W = 920, H = 190, padX = 22, padTop = 22, padBottom = 32

  const maxMinutes = Math.max(60, ...weeklyStudy.map(d => d.minutes))
  const stepX = weeklyStudy.length > 1 ? (W - padX * 2) / (weeklyStudy.length - 1) : 0
  const pts = weeklyStudy.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + (1 - d.minutes / maxMinutes) * (H - padTop - padBottom),
  }))
  const linePath = buildSmoothPath(pts)
  const areaPath = pts.length
    ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(H - padBottom).toFixed(1)} L ${pts[0].x.toFixed(1)},${(H - padBottom).toFixed(1)} Z`
    : ''

  // New: extra canvas width added on the LEFT only, purely to give the
  // hour labels + gridlines somewhere to live. Achieved with a <g
  // transform> around all the original (unchanged) chart markup below,
  // rather than altering padX/stepX/pts — so the curve itself is the
  // exact same path, just shifted right as a whole to make room.
  const padLeft = 34
  const viewW = W + padLeft
  const hourTicks = buildHourTicks(maxMinutes, padTop, H - padTop - padBottom)

  const stats: { icon: keyof typeof IP; value: string; label: string }[] = [
    { icon: 'clock', value: formatStudyDuration(totalMinutes), label: 'Total Studied' },
    { icon: 'progress', value: formatStudyDuration(avgMinutes), label: 'Daily Average' },
    { icon: 'fire', value: `${streakDays} day${streakDays === 1 ? '' : 's'}`, label: 'Current Streak' },
  ]

  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.30)',
        boxShadow: '0 0 70px rgba(41,98,255,0.14), 0 0 140px rgba(124,77,255,0.07), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="absolute top-0 right-0 w-80 h-80 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(41,98,255,0.12) 0%, transparent 65%)', transform: 'translate(20%,-35%)' }} />
      <div className="absolute bottom-0 left-1/4 w-72 h-72 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)', transform: 'translate(-40%,45%)' }} />

      <div className="relative flex items-start justify-between mb-5 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(41,98,255,0.25), rgba(34,211,238,0.20))', border: '1px solid rgba(56,132,255,0.45)', boxShadow: '0 0 18px rgba(41,98,255,0.4)' }}>
            <Ico n="progress" cls="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Your Study Progress</div>
            <div className="text-xs text-slate-500">Study time · Last 7 days</div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {stats.map(s => (
            <div key={s.label} className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(41,98,255,0.14)', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 12px rgba(41,98,255,0.35)' }}>
                <Ico n={s.icon} cls="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100 leading-tight">{s.value}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${viewW} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="spLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7C4DFF" />
              <stop offset="55%" stopColor="#2979FF" />
              <stop offset="100%" stopColor="#22D3EE" />
            </linearGradient>
            <linearGradient id="spArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2979FF" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2979FF" stopOpacity="0" />
            </linearGradient>
            <filter id="spGlow" x="-20%" y="-60%" width="140%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="spDotGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Y-axis: study-hours scale + very subtle horizontal guide lines,
              drawn in the new left margin. Purely additive — doesn't touch
              the curve, dots, day labels, or tooltip below. */}
          {hourTicks.map((t, i) => (
            <g key={`hr-${i}`}>
              <line x1={padLeft} y1={t.y} x2={viewW - padX} y2={t.y}
                stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
              <text x={padLeft - 8} y={t.y + 3} textAnchor="end" fontSize="9"
                fill="rgba(148,163,184,0.40)" fontFamily="Poppins, sans-serif">
                {t.hours}h
              </text>
            </g>
          ))}

          <g transform={`translate(${padLeft},0)`}>
            <path d={areaPath} fill="url(#spArea)" />
            <path d={linePath} fill="none" stroke="url(#spLine)" strokeWidth="2.5" strokeLinecap="round" filter="url(#spGlow)" />

            {pts.map((p, i) => {
              const d = weeklyStudy[i]
              return (
                <g key={i}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => setHoverIdx(hoverIdx === i ? null : i)}
                  style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
                  {d.isToday && <circle cx={p.x} cy={p.y} r="9" fill="#22D3EE" opacity="0.20" filter="url(#spDotGlow)" />}
                  <circle cx={p.x} cy={p.y} r={d.isToday ? 4.5 : 3} fill={d.isToday ? '#22D3EE' : '#7C9CFF'} filter={d.isToday ? 'url(#spDotGlow)' : undefined} />
                  {d.isToday && <circle cx={p.x} cy={p.y} r="1.6" fill="#fff" />}
                </g>
              )
            })}

            {pts.map((p, i) => (
              <text key={i} x={p.x} y={H - 8} textAnchor="middle" fontSize="10.5"
                fill={weeklyStudy[i].isToday ? 'rgba(34,211,238,0.9)' : 'rgba(148,163,184,0.55)'}
                fontFamily="Poppins, sans-serif" fontWeight={weeklyStudy[i].isToday ? 600 : 400}>
                {weeklyStudy[i].label}
              </text>
            ))}
          </g>
        </svg>

        {hoverIdx !== null && (
          <div className="absolute px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-100 pointer-events-none z-10"
            style={{
              left: `${((pts[hoverIdx].x + padLeft) / viewW) * 100}%`,
              top: `${(pts[hoverIdx].y / H) * 100}%`,
              transform: 'translate(-50%, -135%)',
              background: '#0F1B3D',
              border: '1px solid rgba(56,132,255,0.45)',
              boxShadow: '0 0 16px rgba(41,98,255,0.4)',
              whiteSpace: 'nowrap',
            }}>
            {weeklyStudy[hoverIdx].label} · {formatStudyDuration(weeklyStudy[hoverIdx].minutes)}
          </div>
        )}
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

// ─── Today's Study Plan + Today's Focus (paired Home cards) ──────────────────
// Both cards read the SAME real sources: today's schedule (schedule[todayIdx],
// the actual data the Schedules page manages) and the live Focus Lock plan
// (studyPlanStore - the exact snapshot FocusLockPage itself reads and
// writes, synced with Supabase), merged via buildTodayPlanRows/catchUpFocusPlan below. Nothing
// here is hardcoded: with no schedule and no plan yet, both cards fall into
// their empty states instead of showing example subjects.

function parseClockToMinutes(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return 0
  let h = parseInt(m[1], 10) % 12
  const min = parseInt(m[2], 10)
  if (/pm/i.test(m[3])) h += 12
  return h * 60 + min
}
function parseTimeRangeMinutes(start: string, end: string): number {
  const diff = parseClockToMinutes(end) - parseClockToMinutes(start)
  return diff > 0 ? diff : diff + 24 * 60
}

// Same elapsed-time catch-up FocusLockPage applies to itself on mount -
// run here too so a task left running while the person is elsewhere on
// Home still shows accurate progress instead of a stale save-time value.
function catchUpFocusPlan(snap: FocusPlanSnapshot): StudyTask[] {
  if (!snap.running || !snap.activeTaskId || !snap.runningStartedAtMs) return snap.tasks
  const elapsed = Math.max(0, Math.floor((Date.now() - snap.runningStartedAtMs) / 1000))
  if (elapsed <= 0) return snap.tasks
  return snap.tasks.map(t => {
    if (t.id !== snap.activeTaskId) return t
    if (t.mode === 'pomodoro') return { ...t, pomodoroRemaining: Math.max(0, t.pomodoroRemaining - elapsed) }
    return { ...t, regularElapsed: t.regularElapsed + elapsed }
  })
}

interface TodayPlanRow { key: string; subject: string; topic: string; icon: string; color: string; minutes: number; mode: TimerMode }

// Schedule entries (today's actual planned sessions, with real start/end
// times) come first; anything already in the live Focus Lock plan but not
// on today's schedule (e.g. a quick-added topic) is appended after, deduped
// by subject::topic so nothing shows twice.
function buildTodayPlanRows(scheduleToday: ScheduleItem[], planTasks: StudyTask[]): TodayPlanRow[] {
  const taskByKey = new Map(planTasks.map(t => [`${t.subject}::${t.topic}`, t]))
  const seen = new Set<string>()
  const rows: TodayPlanRow[] = []

  scheduleToday.forEach(s => {
    const topic = s.topic || s.subject
    const key = `${s.subject}::${topic}`
    if (seen.has(key)) return
    seen.add(key)
    const matched = taskByKey.get(key)
    rows.push({
      key, subject: s.subject, topic,
      icon: s.iconEmoji, color: s.color,
      minutes: Math.max(1, parseTimeRangeMinutes(s.startTime, s.endTime)),
      mode: matched?.mode ?? 'pomodoro',
    })
  })

  planTasks.forEach(t => {
    const key = `${t.subject}::${t.topic}`
    if (seen.has(key)) return
    seen.add(key)
    const { emoji, color } = subjectVisual(t.subject)
    rows.push({
      key, subject: t.subject, topic: t.topic, icon: emoji, color,
      minutes: Math.max(1, Math.round((t.mode === 'pomodoro' ? t.pomodoroRemaining : t.regularElapsed) / 60)),
      mode: t.mode,
    })
  })

  return rows
}

function TodayStudyPlanCard({ rows, onStartTask, onAddTask }: {
  rows: TodayPlanRow[]
  onStartTask: (subject: string, topic: string) => void
  onAddTask: () => void
}) {
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.26)',
        boxShadow: '0 0 50px rgba(41,98,255,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(41,98,255,0.25), rgba(124,77,255,0.20))', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 14px rgba(41,98,255,0.3)' }}>
            <Ico n="clock" cls="w-4 h-4 text-cyan-300" />
          </div>
          <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Today's Study Plan</div>
        </div>
        <div className="text-xs text-slate-500 flex-shrink-0">{todayLabel}</div>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-3xl mb-2">📭</div>
          <div className="text-sm font-semibold text-slate-300 mb-1">No tasks scheduled for today</div>
          <div className="text-[12px] text-slate-500 max-w-[220px] mb-4">Add a task to build today's study plan.</div>
          <button onClick={onAddTask} className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2979FF, #22D3EE)', boxShadow: '0 0 20px rgba(41,98,255,0.45)' }}>
            + Add Task
          </button>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors hover:border-[rgba(56,132,255,0.35)]"
              style={{ background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(26,40,69,0.6)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                style={{ background: `${r.color}1A`, border: `1px solid ${r.color}44` }}>{r.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-200 truncate">{r.subject}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-slate-500">{r.minutes} min</span>
                </div>
              </div>
              <button onClick={() => onStartTask(r.subject, r.topic)}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2979FF, #7C4DFF)', boxShadow: '0 0 14px rgba(41,98,255,0.5)' }}>
                <Ico n="play" cls="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <button onClick={onAddTask} className="mt-3 w-full py-2.5 rounded-xl text-[12px] font-semibold text-slate-300 border border-dashed transition-all hover:text-cyan-300 hover:border-cyan-500/40"
          style={{ borderColor: 'rgba(56,132,255,0.3)' }}>
          + Add Task
        </button>
      )}
    </div>
  )
}

function TodayFocusCard({ plannedMinutes, completedMinutes, activeTask, onContinueFocus, onStartFirst, onViewPlan }: {
  plannedMinutes: number
  completedMinutes: number
  activeTask: StudyTask | null
  onContinueFocus: () => void
  onStartFirst: (() => void) | null
  onViewPlan: () => void
}) {
  const remainingMinutes = Math.max(0, plannedMinutes - completedMinutes)
  const pct = plannedMinutes > 0 ? Math.min(1, completedMinutes / plannedMinutes) : 0
  const r = 62, circ = 2 * Math.PI * r
  const offset = circ - pct * circ
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  const completedPct = plannedMinutes > 0 ? Math.min(100, Math.round((completedMinutes / plannedMinutes) * 100)) : 0
  const remainingPct = 100 - completedPct

  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.26)',
        boxShadow: '0 0 50px rgba(41,98,255,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(41,98,255,0.25), rgba(34,211,238,0.20))', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 14px rgba(41,98,255,0.3)' }}>
            <Ico n="target" cls="w-4 h-4 text-cyan-300" />
          </div>
          <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Today's Focus</div>
        </div>
        <button onClick={onViewPlan} className="text-[11px] px-3 py-1.5 rounded-lg border text-slate-300 transition-colors hover:text-cyan-300 hover:border-cyan-500/40 flex-shrink-0"
          style={{ borderColor: 'rgba(56,132,255,0.3)', background: 'rgba(41,98,255,0.06)' }}>
          View Plan
        </button>
      </div>

      <div className="flex items-center gap-6 flex-1">
        <div className="relative flex-shrink-0" style={{ width: 150, height: 150 }}>
          <svg width="150" height="150" viewBox="0 0 150 150">
            <defs>
              <linearGradient id="tfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2979FF" /><stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
              <filter id="tfGlow"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx="75" cy="75" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
            <circle cx="75" cy="75" r={r} fill="none" stroke="url(#tfGrad)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset} filter="url(#tfGlow)"
              transform="rotate(-90 75 75)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-xl font-bold text-slate-100">{fmt(completedMinutes)}</div>
            <div className="text-[11px] text-slate-500">/ {fmt(plannedMinutes)}</div>
          </div>
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-[12px] text-slate-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />Completed</span>
              <span className="text-[12px] text-slate-300">{fmt(completedMinutes)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${completedPct}%`, background: 'linear-gradient(90deg,#19D3A2,#22D3EE)' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-[12px] text-slate-300"><span className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />Remaining</span>
              <span className="text-[12px] text-slate-300">{fmt(remainingMinutes)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${remainingPct}%`, background: 'rgba(148,163,184,0.4)' }} />
            </div>
          </div>
        </div>
      </div>

      {activeTask ? (
        <>
          <div className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={{ background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(26,40,69,0.6)' }}>
            {(() => {
              const { emoji, color } = subjectVisual(activeTask.subject)
              return <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: `${color}1A`, border: `1px solid ${color}44` }}>{emoji}</div>
            })()}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">{activeTask.subject}</div>
              <div className="text-[11px] text-slate-500">{activeTask.mode === 'pomodoro' ? 'Pomodoro · 25/5' : 'Regular session'}</div>
            </div>
            <svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4" /></svg>
          </div>
          <button onClick={onContinueFocus} className="mt-3 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)', boxShadow: '0 0 24px rgba(41,98,255,0.5), 0 0 48px rgba(34,211,238,0.2)' }}>
            <Ico n="play" cls="w-4 h-4" />Continue Focus
          </button>
        </>
      ) : (
        <button onClick={onStartFirst ?? onViewPlan} className="mt-4 w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)', boxShadow: '0 0 24px rgba(41,98,255,0.5), 0 0 48px rgba(34,211,238,0.2)' }}>
          <Ico n="play" cls="w-4 h-4" />Start Focus
        </button>
      )}
    </div>
  )
}

// ─── Home Focus Timer (primary) + Quick Timer (secondary) ────────────────────
// Focus Timer is the primary entry point - a live preview of the saved
// Pomodoro/Regular settings with a single glowing "Focus Lock" CTA (this
// card still doesn't own any session logic itself; the actual timer only
// starts once inside FocusLockPage, same as before). Quick Timer sits next
// to it as a visually secondary, self-contained count-up stopwatch - a
// separate, lighter engine from the full Quick Timer page's countdown
// (reached via the chevron), so a 30-second "just time me" doesn't require
// picking a duration first.
function HomeFocusTimerCard({ pomo, onGoFocus }: {
  pomo: PomodoroSettings
  onGoFocus: () => void
}) {
  const mode = useTimerMode()
  const isPomo = mode === 'pomodoro'
  const previewSecs = isPomo ? pomo.focusMinutes * 60 : 0
  const previewStr = isPomo ? formatClock(previewSecs) : '00:00:00'
  const caption = isPomo ? 'Focus Time' : 'Count Up • No Limit'

  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0F1240 0%, #0A0E28 100%)',
        borderColor: 'rgba(124,77,255,0.4)',
        boxShadow: '0 0 60px rgba(124,77,255,0.16), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(124,77,255,0.3), rgba(41,98,255,0.2))', border: '1px solid rgba(124,77,255,0.45)', boxShadow: '0 0 14px rgba(124,77,255,0.35)' }}>
            <Ico n="target" cls="w-4 h-4 text-violet-300" />
          </div>
          <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Focus Timer</div>
        </div>
        <button onClick={() => setTimerMode(isPomo ? 'regular' : 'pomodoro')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors hover:border-violet-400/50"
          style={{ background: 'rgba(124,77,255,0.12)', borderColor: 'rgba(124,77,255,0.3)', color: '#C4AAFF' }}>
          {isPomo ? 'Pomodoro' : 'Regular'}
          <Ico n="chevR" cls="w-3 h-3 rotate-90" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-3">
        <div className="rounded-full flex flex-col items-center justify-center flex-shrink-0"
          style={{
            width: 190, height: 190,
            border: '3px solid rgba(148,197,255,0.65)',
            boxShadow: '0 0 28px rgba(124,77,255,0.45), 0 0 60px rgba(56,132,255,0.25), inset 0 0 30px rgba(124,77,255,0.12)',
            background: 'radial-gradient(circle at 50% 40%, #131A45 0%, #0A0E28 75%)',
          }}>
          <div className="text-[34px] font-bold text-white tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{previewStr}</div>
          <div className="text-[11px] text-slate-400 mt-1">{caption}</div>
        </div>

        <button onClick={onGoFocus}
          className="flex items-center justify-center gap-2 px-8 h-11 rounded-2xl text-white font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #7C4DFF 0%, #2979FF 100%)', boxShadow: '0 0 22px rgba(124,77,255,0.6), 0 0 44px rgba(41,98,255,0.3)' }}>
          <Ico n="lock" cls="w-4 h-4" /> Focus Lock
        </button>
      </div>
    </div>
  )
}

function HomeQuickTimerCard({ onOpenQuickTimer }: { onOpenQuickTimer: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  // Saves the time as study time (studyTimeLog -> study_log), so it counts on
  // Your Study Progress: each full minute while running, on Pause, and when
  // Home is left or the tab closed mid-run.
  const elapsedRef = useRef(0)
  elapsedRef.current = elapsed
  const loggedRef = useRef(0)
  const saveElapsed = useRef(() => {
    const unsaved = elapsedRef.current - loggedRef.current
    if (unsaved <= 0) return
    loggedRef.current = elapsedRef.current
    logStudyTime(QUICK_TIMER_SUBJECT, unsaved)
  }).current
  useEffect(() => { if (!running) saveElapsed() }, [running, saveElapsed])
  useEffect(() => { if (running && elapsed > 0 && elapsed % 60 === 0) saveElapsed() }, [running, elapsed, saveElapsed])
  useEffect(() => {
    window.addEventListener('pagehide', saveElapsed)
    return () => { window.removeEventListener('pagehide', saveElapsed); saveElapsed() }
  }, [saveElapsed])

  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.26)',
        boxShadow: '0 0 40px rgba(41,98,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <button onClick={onOpenQuickTimer}
        className="flex items-center justify-between mb-4 w-full text-left group">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(41,98,255,0.18)', border: '1px solid rgba(56,132,255,0.35)' }}>
            <Ico n="clock" cls="w-3.5 h-3.5 text-cyan-300" />
          </div>
          <div className="text-sm font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Quick Timer</div>
        </div>
        <Ico n="chevR" cls="w-4 h-4 text-slate-500 transition-colors group-hover:text-cyan-300" />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-[30px] font-bold text-white tabular-nums" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {formatClock(elapsed, true)}
        </div>
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center justify-center gap-2 px-6 h-10 rounded-2xl text-white font-semibold text-[13px] transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)', boxShadow: '0 0 18px rgba(41,98,255,0.5)' }}>
          {running
            ? <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <Ico n="play" cls="w-3.5 h-3.5" />}
          {running ? 'Pause' : 'Start'}
        </button>
        <div className="text-[11px] text-slate-500">∞ No limit</div>
      </div>
    </div>
  )
}

// ─── Live Study Rooms + Motivational (Home preview cards) ────────────────────
// The same real rooms the Study Rooms page lists (list_study_rooms, see
// lib/studyRooms.ts): rooms you're in plus public ones, busiest first, with
// live "studying now" counts from open study sessions. Private rooms you're
// not in aren't previewed here - they're joined from the Study Rooms page.
function LiveStudyRoomsCard({ onEnterRoom, onViewAll }: {
  onEnterRoom: (room: RoomData) => void
  onViewAll: () => void
}) {
  const { rooms: roomRows } = useStudyRooms(true)
  const visible = roomRowsToRoomData(roomRows).filter(r => r.isMember || r.isPublic)
  const withLive = visible.map(room => ({ room, live: room.liveCount ?? 0 }))
  const totalStudying = withLive.reduce((sum, x) => sum + x.live, 0)
  const topRooms = [...withLive].sort((a, b) => b.live - a.live || b.room.members - a.room.members).slice(0, 4)

  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.26)',
        boxShadow: '0 0 50px rgba(41,98,255,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, rgba(41,98,255,0.25), rgba(124,77,255,0.20))', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 14px rgba(41,98,255,0.3)' }}>
            <Ico n="rooms" cls="w-4 h-4 text-cyan-300" />
          </div>
          <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Live Study Rooms</div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button onClick={onViewAll} className="text-[12px] text-slate-300 hover:text-cyan-300 transition-colors">View All</button>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{totalStudying} studying</span>
          </div>
        </div>
      </div>

      {topRooms.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <div className="text-3xl mb-2">🌙</div>
          <div className="text-sm font-semibold text-slate-300 mb-3">No live rooms right now</div>
          <button onClick={onViewAll} className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #2979FF, #22D3EE)', boxShadow: '0 0 20px rgba(41,98,255,0.45)' }}>
            Explore Study Rooms
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 flex-1">
          {topRooms.map(({ room, live }) => (
            <div key={room.id} onClick={() => onEnterRoom(room)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors hover:border-[rgba(56,132,255,0.35)]"
              style={{ background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(26,40,69,0.6)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ background: room.iconBg }}>{room.iconEmoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-200 truncate flex items-center gap-1.5">
                  {room.name}{room.emoji && <span>{room.emoji}</span>}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{room.subject} · {live} / {room.members}</div>
              </div>
              <FaceAvatars colors={room.avatarColors} inits={room.avatarInits} />
              <svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2l4 4-4 4" /></svg>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MotivationalCard({ onKeepGoing }: { onKeepGoing: () => void }) {
  return (
    <div className="p-5 rounded-2xl relative overflow-hidden border h-full flex flex-col justify-between"
      style={{
        background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
        borderColor: 'rgba(56,132,255,0.26)',
        boxShadow: '0 0 50px rgba(41,98,255,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
        minHeight: 260,
      }}>
      {/* Abstract night-sky/mountain illustration, blended into the card
          background rather than a separate image - pure SVG gradients so
          it never looks like a bolted-on ad banner. */}
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.85 }}>
        <defs>
          <radialGradient id="mcMoonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mcMtnBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22315C" /><stop offset="100%" stopColor="#0C1631" />
          </linearGradient>
          <linearGradient id="mcMtnFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#141E42" /><stop offset="100%" stopColor="#090E20" />
          </linearGradient>
        </defs>
        <circle cx="300" cy="65" r="60" fill="url(#mcMoonGlow)" />
        <circle cx="300" cy="65" r="15" fill="#E4ECFF" opacity="0.8" />
        <path d="M170 300 L225 185 L265 235 L305 155 L355 225 L400 185 L400 300 Z" fill="url(#mcMtnBack)" opacity="0.75" />
        <path d="M110 300 L185 205 L235 255 L295 195 L355 255 L400 235 L400 300 Z" fill="url(#mcMtnFront)" />
      </svg>

      <div className="relative">
        <div className="text-xl font-bold text-slate-100 leading-snug" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Better Focus.<br />Bigger Dreams.
        </div>
        <div className="text-[12px] text-slate-400 mt-2">You're closer than you think.</div>
      </div>

      <button onClick={onKeepGoing}
        className="relative self-start flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold text-white transition-all hover:opacity-90"
        style={{ background: 'rgba(41,98,255,0.16)', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 16px rgba(41,98,255,0.3)' }}>
        <Ico n="target" cls="w-3.5 h-3.5 text-cyan-300" />
        Keep going
        <Ico n="arrow" cls="w-3.5 h-3.5" />
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
//   - Pomodoro: counts DOWN from the user's saved focus length (25:00 until they change it),
//     then runs their saved break - see the Pomodoro engine below.
//   - Regular: counts UP from 00:00:00, no limit.
// Only one task can actually be "live" against the backend at a time
// (study_sessions enforces a single open row per user - see
// useFocusSession), so starting a task stops whatever task was previously
// running, exactly like the old subject-switch behavior. Each task keeps
// its own paused/resumed value locally so switching between tasks (or
// navigating away and back) never silently resets someone else's progress.
//
// The plan itself (StudyTask / FocusPlanSnapshot) lives in lib/studyPlanStore.ts,
// which keeps it in Supabase and in sync across Home, Focus Lock, Study Rooms,
// Schedules and the user's other tabs/devices.

// ─── Pomodoro engine (pure) ─────────────────────────────────────────────────────
// Focus Lock and Study Rooms both run their Pomodoro tasks through these, so the
// user's saved focus/break/repeat/auto-start settings mean the same thing in both.
//
//   focus ──(reaches 0)──▶ break ──(reaches 0)──▶ fresh focus
//     • Auto-start breaks OFF: the clock stops when focus ends, with the break ready to start.
//     • Repeat OFF:            the clock stops when the break ends, with a fresh focus ready to start.
//
// Plans saved before customizable Pomodoro always used 25:00.
const LEGACY_POMODORO_SECS = 25 * 60
const pomoPhase = (t: StudyTask): PomodoroPhase => t.pomodoroPhase ?? 'focus'
const pomoTotal = (t: StudyTask): number => t.pomodoroTotal ?? LEGACY_POMODORO_SECS
const focusSecsOf = (s: PomodoroSettings) => s.focusMinutes * 60
const breakSecsOf = (s: PomodoroSettings) => s.breakMinutes * 60

// Fields of a brand-new (or reset) Pomodoro session, at the user's saved focus length.
function pomodoroFields(s: PomodoroSettings) {
  return { pomodoroPhase: 'focus' as const, pomodoroRemaining: focusSecsOf(s), pomodoroTotal: focusSecsOf(s) }
}

// Untouched Pomodoro sessions (nothing counted yet) always follow the saved settings, so
// changing 25/5 to 50/10 makes every waiting task read 50:00 straight away. A session
// that's already under way (running or paused mid-way) keeps the length it started with -
// nobody's progress is rewritten - and the new lengths apply from its next phase.
function applyPomodoroSettings(tasks: StudyTask[], s: PomodoroSettings, liveTaskId: string | null): StudyTask[] {
  let changed = false
  const next = tasks.map(t => {
    if (t.mode !== 'pomodoro' || t.id === liveTaskId) return t
    if (t.pomodoroRemaining !== pomoTotal(t)) return t
    const total = pomoPhase(t) === 'break' ? breakSecsOf(s) : focusSecsOf(s)
    if (t.pomodoroRemaining === total && t.pomodoroTotal === total) return t
    changed = true
    return { ...t, pomodoroRemaining: total, pomodoroTotal: total }
  })
  return changed ? next : tasks
}

// Advances a Pomodoro task by `delta` real seconds, crossing focus/break boundaries as needed
// (so a long catch-up after being away lands on the right phase, not on a frozen 00:00).
//   running - whether the clock should keep going after this step
//   studied - seconds of that step that were focus time (breaks aren't study time)
function tickPomodoro(task: StudyTask, delta: number, s: PomodoroSettings): { task: StudyTask; running: boolean; studied: number } {
  let t = task
  let left = Math.max(0, Math.floor(delta))
  let running = true
  let studied = 0
  for (let guard = 0; left > 0 && guard < 20000; guard++) {
    const phase = pomoPhase(t)
    const step = Math.min(left, Math.max(0, t.pomodoroRemaining))
    left -= step
    if (phase === 'focus') studied += step
    const remaining = Math.max(0, t.pomodoroRemaining - step)
    t = { ...t, pomodoroRemaining: remaining }
    if (remaining > 0) break
    if (phase === 'focus') {
      t = { ...t, pomodoroPhase: 'break', pomodoroRemaining: breakSecsOf(s), pomodoroTotal: breakSecsOf(s) }
      if (!s.autoStartBreaks) { running = false; break }
    } else {
      t = { ...t, ...pomodoroFields(s) }
      if (!s.repeat) { running = false; break }
    }
  }
  return { task: t, running, studied }
}

// Backed by studyPlanStore: reads are instant (in-memory, seeded from the
// local cache), writes sync to Supabase in the background.
function loadFocusPlanSnapshot(): FocusPlanSnapshot | null {
  return getPlanSnapshot()
}
function saveFocusPlanSnapshot(snap: FocusPlanSnapshot) {
  setPlanSnapshot(snap)
}

// Moves a task's clock forward by `secs` of real time - Pomodoro through the
// engine (so it can cross focus/break boundaries), Regular just counts up.
// Used by mergeRemotePlan to catch up a plan that's running on another device.
function advanceTask(pomo: PomodoroSettings) {
  return (t: StudyTask, secs: number): { task: StudyTask; running: boolean } =>
    t.mode === 'pomodoro' ? tickPomodoro(t, secs, pomo) : { task: { ...t, regularElapsed: t.regularElapsed + secs }, running: true }
}

function makeTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Seeds the plan from real data (quick-added topics + today's schedule) —
// same de-dup key (subject::topic) the old TasksPanel used — rather than
// ever hard-coding example subjects. Starts empty if there's genuinely
// nothing yet; the empty state below invites adding a task instead.
function seedTasksFromRealData(units: StudyUnit[], schedule: ScheduleItem[][], todayIdx: number, pomo: PomodoroSettings): StudyTask[] {
  const tasks: StudyTask[] = []
  const seen = new Set<string>()
  const addTask = (subject: string, topic: string) => {
    const key = `${subject}::${topic}`
    if (seen.has(key)) return
    seen.add(key)
    tasks.push({ id: makeTaskId(), subject, topic, mode: 'pomodoro', ...pomodoroFields(pomo), regularElapsed: 0 })
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
      className="flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all w-full sm:w-64"
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
function StudyPlanRow({ task, isActive, running, onStart, onPause, onRemove, onToggleComplete }: {
  task: StudyTask; isActive: boolean; running: boolean
  onStart: () => void; onPause: () => void; onRemove: () => void; onToggleComplete: () => void
}) {
  const { emoji, color } = subjectVisual(task.subject)
  const [menuOpen, setMenuOpen] = useState(false)
  const isLiveRunning = isActive && running
  const completed = !!task.completed

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
      style={
        isLiveRunning
          ? { background: 'rgba(25,211,162,0.09)', borderColor: '#19D3A2', boxShadow: '0 0 0 1px rgba(25,211,162,0.25), 0 0 20px rgba(25,211,162,0.22)' }
          : isActive
            ? { background: 'rgba(124,77,255,0.07)', borderColor: 'rgba(124,77,255,0.35)' }
            : { background: 'rgba(11,21,48,0.55)', borderColor: 'rgba(26,40,69,0.7)' }
      }>
      <div className="relative w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ background: `${color}1A`, border: `1px solid ${color}44`, opacity: completed ? 0.5 : 1 }}>
        {emoji}
        {isLiveRunning && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #19D3A2' }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate" style={completed ? { textDecoration: 'line-through', color: '#64748B' } : undefined}>
          {task.subject}
        </div>
        <div className="text-[11px] text-slate-500 truncate" style={completed ? { textDecoration: 'line-through' } : undefined}>
          {task.topic}
        </div>
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
              <button onClick={() => { setMenuOpen(false); onToggleComplete() }}
                className="px-3 py-2 text-[12px] text-emerald-400 hover:bg-emerald-500/10 transition-colors w-full text-left">
                {completed ? 'Mark as incomplete' : 'Mark as complete'}
              </button>
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
// Timer mode is deliberately NOT asked here - the task starts in whichever
// mode the user last selected from the Pomodoro/Regular blocks (see
// timerModeSettings.ts), so adding a task stays a single-step action.
function AddTaskModal({ onClose, onAdd }: { onClose: () => void; onAdd: (subject: string, topic: string) => void }) {
  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const canAdd = subject.trim().length > 0 && topic.trim().length > 0

  function submit() {
    if (!canAdd) return
    onAdd(subject.trim(), topic.trim())
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

// ─── Customize Pomodoro modal ───────────────────────────────────────────────────
// Opened by clicking the "Pomodoro Timer" card in Focus Lock. Saving stores the values as
// the user's default (see _shared/pomodoroSettings.ts) - it is not a one-off for this session.
const FOCUS_PRESETS = [15, 25, 30, 45, 50, 60]
const BREAK_PRESETS = [5, 10, 15]

function parseMinutes(text: string, lim: { min: number; max: number }): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null
  const n = Number(text)
  return n >= lim.min && n <= lim.max ? n : null
}

function PomodoroToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-colors"
      style={{
        width: 44, height: 24,
        background: checked ? 'linear-gradient(135deg,#3B82F6,#7C4DFF)' : '#1A2845',
        border: `1px solid ${checked ? 'rgba(124,77,255,0.7)' : '#2A3A66'}`,
        boxShadow: checked ? '0 0 14px rgba(99,102,241,0.55)' : 'none',
      }}>
      <span className="absolute rounded-full bg-white transition-all" style={{ width: 18, height: 18, top: 2, left: checked ? 22 : 2 }} />
    </button>
  )
}

function PomodoroDurationCard({ icon, title, text, onText, lim, step, presets, onEnter }: {
  icon: React.ReactNode; title: string; text: string; onText: (t: string) => void
  lim: { min: number; max: number }; step: number; presets: number[]; onEnter: () => void
}) {
  const value = parseMinutes(text, lim)
  const bump = (d: number) => {
    const cur = value ?? (Number(text.replace(/\D/g, '')) || lim.min)
    onText(String(Math.min(lim.max, Math.max(lim.min, cur + d))))
  }
  const stepBtn = 'w-10 h-10 rounded-full flex items-center justify-center text-lg text-slate-100 border transition-all hover:opacity-90 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed flex-shrink-0'
  const stepStyle = { background: 'rgba(59,91,255,0.22)', borderColor: 'rgba(96,130,255,0.55)', boxShadow: '0 0 12px rgba(59,91,255,0.25)' }
  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(26,40,69,0.35)', borderColor: '#1E3060' }}>
      <div className="flex items-center gap-2 mb-3 text-slate-200">
        <span className="text-sky-300 flex items-center">{icon}</span>
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <button type="button" aria-label={`Decrease ${title}`} onClick={() => bump(-step)}
          disabled={value !== null && value <= lim.min} className={stepBtn} style={stepStyle}>−</button>
        <div className="flex-1 min-w-0 h-11 rounded-xl border flex items-center justify-center gap-1.5 transition-colors"
          style={{ background: 'rgba(6,13,26,0.6)', borderColor: value === null ? '#F87171' : '#1E3060' }}>
          <input value={text} inputMode="numeric" maxLength={3} aria-label={title}
            onChange={e => onText(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
            className="w-12 bg-transparent outline-none text-center text-xl font-semibold text-white tabular-nums" />
          <span className="text-sm text-slate-400">min</span>
        </div>
        <button type="button" aria-label={`Increase ${title}`} onClick={() => bump(step)}
          disabled={value !== null && value >= lim.max} className={stepBtn} style={stepStyle}>+</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3.5">
        {presets.map(p => {
          const on = value === p
          return (
            <button key={p} type="button" onClick={() => onText(String(p))}
              className="min-w-[38px] h-8 px-2.5 rounded-full border text-[12px] font-medium transition-all"
              style={{
                background: on ? 'rgba(59,91,255,0.28)' : 'rgba(6,13,26,0.5)',
                borderColor: on ? '#6082FF' : '#1E3060',
                color: on ? '#FFFFFF' : '#8B9AC7',
                boxShadow: on ? '0 0 14px rgba(96,130,255,0.55)' : 'none',
              }}>{p}</button>
          )
        })}
      </div>
      <div className="mt-2.5 text-[10px] h-3 text-right" style={{ color: value === null ? '#F87171' : '#5B6A8F' }}>
        {value === null ? `Enter ${lim.min}–${lim.max} min` : 'min'}
      </div>
    </div>
  )
}

function PomodoroSettingsModal({ initial, inProgress, onClose, onSave }: {
  initial: PomodoroSettings; inProgress: boolean; onClose: () => void; onSave: (s: PomodoroSettingsInput) => void
}) {
  const [focusText, setFocusText] = useState(String(initial.focusMinutes))
  const [breakText, setBreakText] = useState(String(initial.breakMinutes))
  const [repeat, setRepeat] = useState(initial.repeat)
  const [autoStart, setAutoStart] = useState(initial.autoStartBreaks)
  const focusMin = parseMinutes(focusText, POMODORO_LIMITS.focus)
  const breakMin = parseMinutes(breakText, POMODORO_LIMITS.break)
  const canSave = focusMin !== null && breakMin !== null

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submit() {
    if (focusMin === null || breakMin === null) return
    onSave({ focusMinutes: focusMin, breakMinutes: breakMin, repeat, autoStartBreaks: autoStart })
  }

  const toggleCard = 'rounded-2xl border px-4 py-3.5 flex items-center gap-3'
  const toggleStyle = { background: 'rgba(26,40,69,0.35)', borderColor: '#1E3060' }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pomo-modal-title"
        className="w-[660px] max-w-full max-h-[94vh] overflow-y-auto rounded-2xl border p-6"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
        <div className="flex items-center justify-between mb-5">
          <div id="pomo-modal-title" className="flex items-center gap-3 text-lg font-semibold text-slate-100">
            <span className="text-2xl leading-none">🍅</span>Customize Pomodoro
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PomodoroDurationCard title="Focus Duration" text={focusText} onText={setFocusText} lim={POMODORO_LIMITS.focus}
            step={5} presets={FOCUS_PRESETS} onEnter={submit} icon={<Ico n="target" cls="w-[18px] h-[18px]" />} />
          <PomodoroDurationCard title="Break Duration" text={breakText} onText={setBreakText} lim={POMODORO_LIMITS.break}
            step={1} presets={BREAK_PRESETS} onEnter={submit}
            icon={<svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h12v5a4 4 0 01-4 4H8a4 4 0 01-4-4V9zM16 10h1.5a2.5 2.5 0 010 5H16M7 3.5v2M10 3.5v2M13 3.5v2" /></svg>} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className={toggleCard} style={toggleStyle}>
            <span className="text-sky-300 flex-shrink-0"><Ico n="clock" cls="w-[18px] h-[18px]" /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-100">Auto-start breaks</div>
              <div className="text-[11px] text-slate-500 leading-snug mt-0.5">Automatically start break after focus ends</div>
            </div>
            <PomodoroToggle checked={autoStart} onChange={setAutoStart} label="Auto-start breaks" />
          </div>
          <div className={toggleCard} style={toggleStyle}>
            <span className="text-sky-300 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0113.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.6L4 16M4 20v-4h4" /></svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-slate-100">Repeat</div>
              <div className="text-[11px] text-slate-500 leading-snug mt-0.5">Keep repeating for next session</div>
            </div>
            <PomodoroToggle checked={repeat} onChange={setRepeat} label="Repeat" />
          </div>
        </div>

        <div className="mt-5 py-3 border-y flex items-center justify-center gap-2 text-[13px] text-slate-300" style={{ borderColor: 'rgba(30,48,96,0.8)' }}>
          <span className="text-sky-300"><Ico n="zap" cls="w-4 h-4" /></span>
          <span data-testid="pomo-summary">{focusMin ?? '–'} min focus · {breakMin ?? '–'} min break</span>
        </div>

        {inProgress && (
          <div className="mt-3 text-[11px] text-slate-500 text-center leading-relaxed">
            A Pomodoro already under way finishes at the length it started with — these apply to every new one.
          </div>
        )}

        <div className="flex gap-3 mt-5 justify-end">
          <button type="button" onClick={onClose}
            className="min-w-[110px] px-5 py-2.5 rounded-xl border text-sm text-slate-300 hover:text-white transition-colors"
            style={{ borderColor: '#1E3060', background: 'rgba(26,40,69,0.5)' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!canSave}
            className="min-w-[150px] px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #3B5BFF, #7C4DFF)', boxShadow: '0 0 24px rgba(99,102,241,0.55), 0 0 48px rgba(25,181,230,0.2)' }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Notes panel ───────────────────────────────────────────────────────────
// Scratch space saved to the account (study_plans.quick_notes via
// studyPlanStore), so a note survives leaving Focus Lock, reloads, and shows
// up on the user's other tabs/devices. The panel owns the text while typing;
// a note changed elsewhere replaces it when it arrives.
function QuickNotesPanel() {
  const [note, setNote] = useState(getQuickNotes)
  useEffect(() => subscribePlan(source => {
    if (source === 'remote') setNote(getQuickNotes())
  }), [])
  function onChange(text: string) {
    setNote(text)
    setQuickNotes(text)
  }
  return (
    <div className="rounded-2xl border p-4 flex-1 flex flex-col min-h-[140px]"
      style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">📝</span>
        <span className="text-sm font-semibold text-slate-100">Quick Notes</span>
      </div>
      <textarea value={note} onChange={e => onChange(e.target.value)} maxLength={20000}
        placeholder="No notes yet…
Add a quick note for this session."
        className="flex-1 w-full bg-transparent outline-none text-[13px] leading-relaxed text-slate-300 placeholder-slate-600 resize-none" />
    </div>
  )
}

function FocusLockPage({ units, schedule, todayIdx, onNavigate, profile, autoStartTask, onAutoStartHandled }: { units: StudyUnit[]; schedule: ScheduleItem[][]; todayIdx: number; onNavigate: (id: string) => void; profile?: ProfileInfo; autoStartTask?: { subject: string; topic: string } | null; onAutoStartHandled?: () => void }) {
  // The user's saved Pomodoro configuration (25/5/Repeat until they change it). Same store the
  // Study Room reads, so a change here is the new default everywhere.
  const { settings: pomo, save: savePomo } = usePomodoroSettings()
  const [snapshot] = useState(loadFocusPlanSnapshot)
  const [tasks, setTasks] = useState<StudyTask[]>(() => snapshot?.tasks ?? seedTasksFromRealData(units, schedule, todayIdx, getPomodoroSettings()))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(snapshot?.activeTaskId ?? null)
  const [running, setRunning] = useState<boolean>(!!snapshot?.running)
  // Persisted last-picked timer mode (Pomodoro is the default for a user who
  // has never picked one) - shared with Home/the task picker, so it stays the
  // same choice everywhere until the user taps the other block themselves.
  const selectedMode = useTimerMode()
  const [fullscreen, setFullscreen] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showPomodoroSettings, setShowPomodoroSettings] = useState(false)
  // Pause Reflection gate: clicking Pause opens this instead of pausing directly.
  // The task id is captured at click-time so "Unlock Pause" pauses the right task
  // even if activeTask/activeTaskId were to change while the modal is open.
  const [pendingPauseTaskId, setPendingPauseTaskId] = useState<string | null>(null)
  const didCatchUp = useRef(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Latest values for the 1s interval below, which is created once per run and would otherwise see stale ones.
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  const pomoRef = useRef(pomo)
  pomoRef.current = pomo

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
  const planSync = useStudyPlanStore()

  // Side effects of a Pomodoro tick, kept out of the state updater. Reassigned every render so it
  // always sees the current start/stop closures even though the 1s interval is created only once.
  const afterPomodoroTickRef = useRef<(before: StudyTask, r: { task: StudyTask; running: boolean }) => void>(() => {})
  afterPomodoroTickRef.current = (before, r) => {
    if (!r.running) {
      // Waiting on the user (Auto-start breaks off / Repeat off): stop the clock and close the study session.
      setRunning(false)
      stopRemoteSession()
      return
    }
    const from = pomoPhase(before), to = pomoPhase(r.task)
    if (from === to) return
    if (to === 'break') stopRemoteSession()          // focus finished: closes + logs the session - a break isn't study time
    else void startRemoteSession(before.subject)     // Repeat: the next focus round is study time again
  }

  // One-time catch-up: if the plan was left running and the tab/app was
  // closed or backgrounded, fast-forward the active task by real elapsed
  // time instead of silently losing (or freezing) its progress.
  useEffect(() => {
    if (didCatchUp.current) return
    didCatchUp.current = true
    if (!snapshot?.running || !snapshot.activeTaskId || !snapshot.runningStartedAtMs) return
    const elapsed = Math.max(0, Math.floor((Date.now() - snapshot.runningStartedAtMs) / 1000))
    if (elapsed <= 0) return
    const away = tasksRef.current.find(t => t.id === snapshot.activeTaskId)
    if (away && away.mode === 'pomodoro') {
      // Through the engine: time spent away can cross focus/break boundaries.
      const r = tickPomodoro(away, elapsed, pomoRef.current)
      setTasks(prev => prev.map(t => t.id === away.id ? r.task : t))
      if (!r.running) setRunning(false)
      return
    }
    setTasks(prev => prev.map(t => {
      if (t.id !== snapshot.activeTaskId) return t
      return { ...t, regularElapsed: t.regularElapsed + elapsed }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Untouched Pomodoro sessions follow the saved settings (see applyPomodoroSettings): covers the
  // user saving new values, and saved values arriving from the backend after the first render.
  useEffect(() => {
    setTasks(prev => applyPomodoroSettings(prev, pomo, running ? activeTaskId : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.focusMinutes, pomo.breakMinutes])

  // NOTE: the segmented mode tab intentionally does NOT follow whichever
  // task happens to be active/running. selectedMode is the user's saved
  // default for the *next* task they add and start - per the requirement
  // that it "persists until they manually change it" - not a live mirror
  // of the currently running task's mode.

  // Local 1s ticker for the active task only - Pomodoro counts down,
  // Regular counts up indefinitely.
  useEffect(() => {
    if (running && activeTaskId) {
      tickRef.current = setInterval(() => {
        const cur = tasksRef.current.find(t => t.id === activeTaskId)
        if (cur && cur.mode === 'pomodoro') {
          // Pomodoro goes through the shared engine, so focus -> break -> next focus follows the saved settings.
          setTasks(prev => prev.map(t => t.id === cur.id ? tickPomodoro(t, 1, pomoRef.current).task : t))
          afterPomodoroTickRef.current(cur, tickPomodoro(cur, 1, pomoRef.current))
          return
        }
        // Regular timer: unchanged - count up one second.
        setTasks(prev => prev.map(t => {
          if (t.id !== activeTaskId || t.mode !== 'regular') return t
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

  // Changes made somewhere else - Home, Schedules' plan, another tab or
  // device, or the first load from Supabase - replace this page's plan. The
  // one exception is the task this page is itself running: its clock keeps
  // its own to-the-second value instead of the last synced one.
  const activeTaskIdRef = useRef(activeTaskId)
  activeTaskIdRef.current = activeTaskId
  const runningRef = useRef(running)
  runningRef.current = running
  useEffect(() => subscribePlan(source => {
    if (source !== 'remote') return
    const remote = loadFocusPlanSnapshot()
    if (!remote) return
    const next = mergeRemotePlan(remote, { tasks: tasksRef.current, activeTaskId: activeTaskIdRef.current, running: runningRef.current }, advanceTask(pomoRef.current))
    if (next.stopHere) stopRemoteSession()
    setTasks(next.tasks)
    setActiveTaskId(next.activeTaskId)
    setRunning(next.running)
  }), [stopRemoteSession])

  const activeTask = tasks.find(t => t.id === activeTaskId) || null

  async function handleStartTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    if (running && activeTaskId && activeTaskId !== taskId) {
      // Only one live study_sessions row per user - starting a different
      // task means stopping (and logging) whatever was running before.
      await stopRemoteSession()
    }
    // A Pomodoro left sitting at 00:00 (from before breaks existed) starts over fresh.
    if (task.mode === 'pomodoro' && task.pomodoroRemaining <= 0) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...pomodoroFields(pomo) } : t))
    }
    setActiveTaskId(taskId)
    setRunning(true)
    // A break isn't study time: only focus phases (and Regular) open a backend study session.
    const startingBreak = task.mode === 'pomodoro' && pomoPhase(task) === 'break'
    if (!startingBreak) {
      try { await startRemoteSession(task.subject) } catch { /* hook already falls back to a local-only clock */ }
    }
  }

  async function handlePauseTask(taskId: string) {
    if (activeTaskId !== taskId || !running) return
    setRunning(false)
    await stopRemoteSession()
  }

  // Gate in front of handlePauseTask: every "Pause" control opens the reflection
  // modal instead of pausing immediately. The timer keeps running underneath -
  // handlePauseTask only actually fires once the user unlocks it (150+ words) and
  // clicks "Unlock Pause"; "Keep Studying" / close just dismiss with no side effect.
  function requestPause(taskId: string) {
    if (activeTaskId !== taskId || !running) return
    setPendingPauseTaskId(taskId)
  }

  function handleRemoveTask(taskId: string) {
    if (activeTaskId === taskId) {
      setRunning(false)
      stopRemoteSession()
      setActiveTaskId(null)
    }
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  // Marking a task complete is purely a visual/organizational flag (the
  // strikethrough) - it doesn't touch the timer, so a task someone forgot
  // to check off mid-session keeps counting exactly as before.
  function handleToggleComplete(taskId: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t))
  }

  // The main Start button under the ring: no task selected yet -> resume/
  // start whatever's already active; nothing active but tasks exist ->
  // default to the first one in the list; no tasks at all -> there's
  // nothing to start, so open Add Task instead.
  function handleMainStart() {
    if (activeTask) { handleStartTask(activeTask.id); return }
    if (tasks.length > 0) { handleStartTask(tasks[0].id); return }
    setShowAddTask(true)
  }

  function handleAddTask(subject: string, topic: string) {
    // No mode prompt: the task starts in whichever mode the user selected
    // last (the Pomodoro/Regular blocks above), same store Start reads from.
    const task: StudyTask = { id: makeTaskId(), subject, topic, mode: selectedMode, ...pomodoroFields(pomo), regularElapsed: 0 }
    setTasks(prev => [task, ...prev])
    setShowAddTask(false)
  }

  // Lets Home's "Today's Study Plan" ▶ button jump straight into a running
  // session for a specific task, instead of just landing on this page and
  // making the person press play again. Runs once per incoming request;
  // onAutoStartHandled clears it so it doesn't refire on later renders.
  useEffect(() => {
    if (!autoStartTask) return
    const key = `${autoStartTask.subject}::${autoStartTask.topic}`
    const existing = tasks.find(t => `${t.subject}::${t.topic}` === key)
    if (existing) {
      handleStartTask(existing.id)
    } else {
      // Not in the plan yet - add it, then start it directly (rather than
      // via handleStartTask, whose `tasks` lookup would still see the
      // pre-update array in this same tick and silently no-op).
      const task: StudyTask = { id: makeTaskId(), subject: autoStartTask.subject, topic: autoStartTask.topic, mode: selectedMode, ...pomodoroFields(pomo), regularElapsed: 0 }
      setTasks(prev => [task, ...prev])
      if (running && activeTaskId && activeTaskId !== task.id) stopRemoteSession()
      setActiveTaskId(task.id)
      setRunning(true)
      startRemoteSession(task.subject).catch(() => { /* hook already falls back to a local-only clock */ })
    }
    onAutoStartHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartTask])

  // ── Main circle: mirrors the active task while one is running/paused;
  // otherwise previews whichever mode tab is selected. ──
  const isLiveRunning = running && !!activeTask
  let circleRemaining: number, circleTotal: number, circleTimeStr: string
  if (activeTask) {
    if (activeTask.mode === 'pomodoro') {
      circleRemaining = activeTask.pomodoroRemaining
      circleTotal = pomoTotal(activeTask)
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
    circleRemaining = focusSecsOf(pomo)
    circleTotal = focusSecsOf(pomo)
    circleTimeStr = formatClock(focusSecsOf(pomo))
  } else {
    circleRemaining = 0
    circleTotal = 0 // TimerCircle treats total<=0 as "no progress yet" - an empty ring preview
    circleTimeStr = '00:00:00'
  }
  const activeOnBreak = !!activeTask && activeTask.mode === 'pomodoro' && pomoPhase(activeTask) === 'break'
  const waitingToStartBreak = activeOnBreak && !running && activeTask!.pomodoroRemaining === pomoTotal(activeTask!)
  const circleCaption = activeTask
    ? (activeTask.mode === 'pomodoro' ? (activeOnBreak ? 'Break Time' : 'Study Time') : 'Studying')
    : (selectedMode === 'pomodoro' ? pomodoroSummaryLabel(pomo) : 'Count Up • No Limit')

  // First load of the plan from Supabase shows the same 'Syncing…' as the session check.
  const headerStatus = sessionLoading || planSync.status === 'loading'
    ? 'Syncing…'
    : activeTask
      ? (running ? `${activeOnBreak ? '☕ Break' : '●'} ${activeTask.subject} — ${activeTask.topic}` : '⏸ Paused')
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
              onClick={() => activeTask && (running ? requestPause(activeTask.id) : handleStartTask(activeTask.id))}
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
            {/* ── Mode selector + Main timer (left) next to My Study Plan (right, moved up
                beside the timer so it's visible without scrolling) ── */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">

              {/* Left: mode selector, main timer, current focus */}
              <div className="flex-1 min-w-0 w-full flex flex-col gap-8">
                {/* Clicking a block just selects that mode (and it sticks until the
                    other block is tapped) - it no longer opens the Pomodoro settings
                    dialog. That dialog now has its own gear icon, to the left of the
                    Pomodoro block. Both blocks are pinned to the same width (ModeTab's
                    sm:w-64) so they stay symmetric regardless of label length. */}
                <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button onClick={() => setShowPomodoroSettings(true)}
                      title="Customize Pomodoro" aria-label="Customize Pomodoro settings"
                      className="w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90 active:scale-95"
                      style={{ background: '#0B1530', borderColor: '#1A2845', color: '#8B9AC7' }}>
                      <Ico n="cog" cls="w-4 h-4" />
                    </button>
                    <ModeTab active={selectedMode === 'pomodoro'} onClick={() => setTimerMode('pomodoro')}
                      icon={<TimerModeIcon mode="pomodoro" />} title="Pomodoro Timer" sub={pomodoroSummaryLabel(pomo)} />
                  </div>
                  <ModeTab active={selectedMode === 'regular'} onClick={() => setTimerMode('regular')}
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
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={handleMainStart} disabled={isLiveRunning}
                      className="h-11 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] px-8 disabled:opacity-40"
                      style={{ background: '#19D3A2', color: '#04140F', boxShadow: isLiveRunning ? 'none' : '0 0 24px rgba(25,211,162,0.4)' }}>
                      <Ico n="play" cls="w-4 h-4 flex-shrink-0" />
                      {waitingToStartBreak ? 'Start Break' : 'Start'}
                    </button>
                    <button onClick={() => activeTask && requestPause(activeTask.id)} disabled={!isLiveRunning}
                      className="h-11 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] px-8 disabled:opacity-40"
                      style={{ background: '#1A2845', color: '#C7D2FE' }}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      Pause
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: My Study Plan (top, right next to the timer) + Quick Notes (below it) */}
              <div className="w-full lg:w-[400px] flex-shrink-0 flex flex-col gap-6">
                <div className="rounded-2xl border flex flex-col"
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
                        onPause={() => requestPause(task.id)}
                        onRemove={() => handleRemoveTask(task.id)}
                        onToggleComplete={() => handleToggleComplete(task.id)} />
                    ))}
                  </div>
                </div>

                <QuickNotesPanel />
              </div>
            </div>
          </div>
        </main>
      </div>

      {showAddTask && <AddTaskModal onClose={() => setShowAddTask(false)} onAdd={handleAddTask} />}
      {showPomodoroSettings && (
        <PomodoroSettingsModal
          initial={pomo}
          inProgress={tasks.some(t => t.mode === 'pomodoro' && t.pomodoroRemaining > 0 && t.pomodoroRemaining !== pomoTotal(t))}
          onClose={() => setShowPomodoroSettings(false)}
          onSave={next => { setShowPomodoroSettings(false); void savePomo(next) }} />
      )}
      {pendingPauseTaskId && (
        <PauseReflectionModal
          onClose={() => setPendingPauseTaskId(null)}
          onUnlock={() => { const id = pendingPauseTaskId; setPendingPauseTaskId(null); handlePauseTask(id) }} />
      )}
    </div>
  )
}

// ─── Pause Reflection Modal ─────────────────────────────────────────────────────
// Shown when the user tries to pause from inside Focus Lock. Doesn't touch the
// timer itself - it just gates the actual pause behind a short "why am I
// pausing" reflection, so a break is a deliberate choice rather than a reflex tap.
// The typed text stays in this component only - never saved (see pauseReflection.ts).
function PauseReflectionModal({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
  const [text, setText] = useState('')
  const wordCount = countReflectionWords(text)
  const unlocked = isPauseUnlocked(text)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,21,0.72)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full rounded-3xl border relative flex flex-col"
        style={{
          maxWidth: 520,
          background: '#0B1530',
          borderColor: '#1E3060',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(30,72,150,0.25), 0 0 48px rgba(59,130,246,0.14)',
        }}>
        <button onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>

        <div className="flex flex-col items-center text-center px-7 pt-8 pb-1">
          <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid #2B4E8C', boxShadow: '0 0 24px rgba(59,130,246,0.35)' }}>
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#5AB6FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="10" width="12" height="9" rx="2" /><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#F3F4F6]">Before you pause…</h2>
          <p className="mt-2 text-[13px] text-slate-400">Take a moment before breaking your focus.</p>
          <p className="mt-3 text-[13px] text-slate-200">
            Type <span className="font-semibold" style={{ color: '#5AB6FF' }}>{PAUSE_REFLECTION_MIN_WORDS} words</span> — anything on your mind.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            It can be what you were studying, why you want to pause, what you're thinking about — or just random words.
          </p>
        </div>

        <div className="px-7 pt-4">
          <div className="flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5"
            style={{ background: 'rgba(59,130,246,0.06)', borderColor: '#1E3060' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="#5AB6FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7v.5h5.6v-.5c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3Z" />
            </svg>
            <div className="text-[12px] leading-snug">
              <span className="font-semibold text-slate-200">Yes, random words are allowed. </span>
              <span className="text-slate-500">This isn't an essay.</span>
            </div>
          </div>
        </div>

        <div className="px-7 pt-3">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Start typing... (min. ${PAUSE_REFLECTION_MIN_WORDS} words)`}
            rows={5}
            autoFocus
            className="w-full resize-none rounded-xl border px-3.5 py-3 text-[13px] text-slate-100 placeholder:text-slate-600 focus:outline-none transition-colors"
            style={{ background: 'rgba(6,13,26,0.6)', borderColor: unlocked ? '#19B5E6' : '#1A2845' }} />
          <div className="mt-1.5 text-right text-[11px]" style={{ color: unlocked ? '#19D3A2' : '#68728A' }}>
            {wordCount} / {PAUSE_REFLECTION_MIN_WORDS} words
          </div>
        </div>

        <div className="px-7 pt-1 pb-7 flex flex-col sm:flex-row gap-3">
          <button
            disabled={!unlocked}
            onClick={() => { if (unlocked) onUnlock() }}
            className="flex-1 h-11 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:active:scale-100"
            style={unlocked
              ? { color: '#fff', background: 'linear-gradient(135deg, #19B5E6 0%, #0F86B8 100%)', boxShadow: '0 0 20px rgba(25,181,230,0.45), 0 0 40px rgba(25,181,230,0.2)' }
              : { color: '#5A6478', background: 'rgba(255,255,255,0.04)', border: '1px solid #1A2845', cursor: 'not-allowed' }}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Unlock Pause
          </button>
          <button onClick={onClose}
            className="flex-1 h-11 rounded-2xl font-semibold text-sm flex items-center justify-center transition-all hover:opacity-90 active:scale-[0.98] border"
            style={{ color: '#5AB6FF', background: 'rgba(59,130,246,0.08)', borderColor: '#2B4E8C' }}>
            Keep Studying
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Study Rooms Page ─────────────────────────────────────────────────────────

interface RoomData {
  id: number | string; name: string; emoji: string; classes: string; subject: string
  desc: string; members: number; avatarColors: string[]; avatarInits: string[]
  iconBg: string; iconEmoji: string; tag: 'popular' | 'all' | 'myrooms'
  isPublic: boolean; isUserCreated?: boolean; isOwner?: boolean
  subjectTag: string
  // Set for real rooms (study_groups rows, see lib/studyRooms.ts). Rooms without
  // a groupId are a community's local demo room and keep their scripted bots.
  groupId?: string; isMember?: boolean; hasPassword?: boolean; liveCount?: number; memberLimit?: number
}

interface BotParticipant {
  id: string; name: string; initials: string; subject: string
  studyTimeSecs: number; isStudying: boolean; isPaused?: boolean; cardGrad: string; accentColor: string
  isMe?: boolean
}

interface ChatMsg {
  id: string; name: string; text: string; time: string; isBot: boolean; isMe: boolean
}

// Real rooms come from list_study_rooms (lib/studyRooms.ts). Their look is
// derived deterministically from name/subject, so a room renders the same
// everywhere without storing colours.
const ROOM_GRADIENTS: [string, string][] = [
  ['#1E40AF', '#3B82F6'], ['#7C4DFF', '#A855F7'], ['#0C7FAA', '#19B5E6'], ['#0A9673', '#19D3A2'],
  ['#BE185D', '#F43F5E'], ['#1E3A8A', '#3B82F6'], ['#5835CC', '#7C4DFF'], ['#C2410C', '#F97316'],
]
const FACE_COLORS = ['#7C4DFF', '#0F99CC', '#EC4899', '#F59E0B', '#0DAE86', '#3B82F6', '#F97316', '#9B6CFF']

// "Popular": the busiest rooms with a few members, by live then total members.
function popularRoomIds(rows: RoomRow[]): Set<string> {
  return new Set([...rows]
    .filter(r => r.member_count >= 3)
    .sort((a, b) => b.live_count - a.live_count || b.member_count - a.member_count)
    .slice(0, 6)
    .map(r => r.id))
}

function roomRowToRoomData(r: RoomRow, popular: Set<string>): RoomData {
  const subject = r.subject?.trim() || 'All Subjects'
  const [c1, c2] = ROOM_GRADIENTS[hashSubject(`${r.name}|${subject}`) % ROOM_GRADIENTS.length]
  const inits = (r.preview_initials ?? []).filter(Boolean).slice(0, 4)
  const isAdmin = r.my_role === 'admin'
  return {
    id: r.id, groupId: r.id, name: r.name, emoji: '', classes: r.is_official ? 'Official Room' : 'All Classes',
    subject, desc: r.description?.trim() || 'Study together. Stay focused.', members: r.member_count,
    avatarColors: inits.map((x, i) => FACE_COLORS[(hashSubject(x) + i) % FACE_COLORS.length]), avatarInits: inits,
    iconBg: `linear-gradient(135deg, ${c1}, ${c2})`, iconEmoji: subjectVisual(subject).emoji,
    tag: popular.has(r.id) ? 'popular' : isAdmin ? 'myrooms' : 'all',
    isPublic: r.visibility === 'public', isUserCreated: isAdmin, isOwner: isAdmin, subjectTag: subject.toLowerCase(),
    isMember: r.is_member, hasPassword: r.has_password, liveCount: r.live_count, memberLimit: r.member_limit,
  }
}

function roomRowsToRoomData(rows: RoomRow[]): RoomData[] {
  const popular = popularRoomIds(rows)
  return rows.map(r => roomRowToRoomData(r, popular))
}

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

// Scripted participants for a community's local demo room only (no groupId).
function getRoomBots(room: RoomData): BotParticipant[] {
  if (room.isUserCreated || room.groupId) return []
  const seed = Number(room.id) || 0
  const count = 3 + (seed % 3)
  const subjects = room.subject === 'All Subjects'
    ? ['Physics', 'Chemistry', 'Mathematics', 'Biology']
    : [`${room.subject}`, `${room.subject} — Advanced`, `${room.subject} — PYQs`]
  return BOT_POOL.slice(0, count).map((b, i) => ({
    ...b,
    id: `bot-${room.id}-${i}`,
    subject: subjects[i % subjects.length],
    studyTimeSecs: b.isStudying ? (30 + ((seed * 17 + i * 23) % 120)) * 60 : 0,
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
function StudyRoomsPage({ onNavigate, onEnterRoom, profile, communityTab, onCommunityTabChange, onOpenCommunity, communities, communitiesStatus, communitiesError, onRefreshCommunities, pendingJoinRoomId, onPendingJoinHandled }: {
  onNavigate: (id: string) => void
  onEnterRoom: (room: RoomData) => void
  profile?: ProfileInfo
  // A room to open the Join flow for on arrival (an invite link, or Home's
  // Live Study Rooms card for a room you're not in yet).
  pendingJoinRoomId?: string | null
  onPendingJoinHandled?: () => void
  // Owned by the App root (not local state) so that coming Back from a
  // community's page lands on the Communities tab again, not Study Rooms.
  communityTab: 'rooms' | 'communities'
  onCommunityTabChange: (t: 'rooms' | 'communities') => void
  onOpenCommunity: (c: CommunityData) => void
  communities: CommunityData[]
  communitiesStatus: 'loading' | 'ready' | 'error'
  communitiesError: string | null
  onRefreshCommunities: () => Promise<void>
}) {
  const [tab, setTab] = useState<RoomTab>('all')
  const [subjectFilter, setSubjectFilter] = useState('All Subjects')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [passwordRoomId, setPasswordRoomId] = useState<string | number | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [inviteRoom, setInviteRoom] = useState<RoomData | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null)
  const [copied, setCopied] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', subject: '', desc: '', isPublic: true, password: '' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Set while handling an invite link / Home card request: a successful join
  // then goes straight into the room instead of just flipping Join to Enter.
  const enterAfterJoinRef = useRef(false)
  // Parent "Community" module tabs. Everything below this — Hero, Search,
  // the All Rooms/My Rooms/Popular/Subject Wise tabs, the room list, and
  // all three modals — is the pre-existing Study Rooms page, completely
  // unchanged. It's now just the "Study Rooms" tab's content; a second
  // "Communities" tab (placeholder for now) sits alongside it.
  const setCommunityTab = onCommunityTabChange

  // Real rooms (study_groups), membership included - see lib/studyRooms.ts.
  const { rooms: roomRows, status: roomsStatus, error: roomsError, refresh: refreshRooms } = useStudyRooms(true)
  const allRooms = useMemo(() => roomRowsToRoomData(roomRows), [roomRows])
  const filtered = allRooms.filter(r => {
    if (tab === 'popular') return r.tag === 'popular' && !r.isUserCreated
    if (tab === 'myrooms') return !!r.isUserCreated
    if (tab === 'subject') {
      if (subjectFilter !== 'All Subjects' && r.subject !== 'All Subjects'
        && !r.subject.toLowerCase().includes(subjectFilter.toLowerCase().slice(0, 4))) return false
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

  function joinMessage(result: string): string | null {
    if (result === 'full') return 'This room is full.'
    if (result === 'invite_only') return 'This room is invite-only.'
    if (result === 'wrong_password') return 'Incorrect password. Try again.'
    return null
  }

  async function handleJoin(room: RoomData) {
    if (room.isMember || !room.groupId || busy) return
    if (!room.isPublic) {
      if (!room.hasPassword) { setNotice('This room is invite-only.'); return }
      setPasswordRoomId(room.id); setPasswordInput(''); setPasswordError(null)
      return
    }
    setBusy(true)
    try {
      const result = await joinRoom(room.groupId)
      const msg = joinMessage(result)
      if (msg) setNotice(msg)
      await refreshRooms()
      if (!msg && enterAfterJoinRef.current) onEnterRoom({ ...room, isMember: true })
      enterAfterJoinRef.current = false
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submitPassword() {
    const room = allRooms.find(r => r.id === passwordRoomId)
    if (!room?.groupId || busy) return
    if (!passwordInput) { setPasswordError('Enter the room password.'); return }
    setBusy(true)
    try {
      const result = await joinRoom(room.groupId, passwordInput)
      const msg = joinMessage(result)
      if (msg) { setPasswordError(msg); return }
      setPasswordRoomId(null)
      setPasswordInput('')
      await refreshRooms()
      if (enterAfterJoinRef.current) onEnterRoom({ ...room, isMember: true })
      enterAfterJoinRef.current = false
    } catch (e) {
      setPasswordError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave(room: RoomData) {
    setOpenMenuId(null)
    if (!room.groupId || busy) return
    setBusy(true)
    try {
      await leaveRoom(room.groupId)
      await refreshRooms()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateRoom() {
    if (!createForm.name.trim() || busy) return
    if (!createForm.isPublic && createForm.password.length < 4) { setCreateError('Private rooms need a password of at least 4 characters.'); return }
    setBusy(true)
    setCreateError(null)
    try {
      await createRoom(createForm)
      await refreshRooms()
      setShowCreate(false)
      setCreateForm({ name: '', subject: '', desc: '', isPublic: true, password: '' })
    } catch (e) {
      setCreateError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function copyInviteLink(room: RoomData) {
    if (!room.groupId) return
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    try {
      navigator.clipboard.writeText(roomInviteLink(room.groupId)).then(done, () => setNotice('Could not copy the link.'))
    } catch {
      setNotice('Could not copy the link.')
    }
  }
  function shareInvite(room: RoomData, via: string) {
    if (!room.groupId) return
    const link = roomInviteLink(room.groupId)
    const text = `Study with me in "${room.name}" on Wynko: ${link}`
    const url = via === 'WhatsApp' ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : via === 'Telegram' ? `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Study with me in "${room.name}" on Wynko`)}`
      : `mailto:?subject=${encodeURIComponent(`Join my study room: ${room.name}`)}&body=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener')
  }

  // Invite link / Home card: open the Join flow for that room once the list has loaded.
  useEffect(() => {
    if (!pendingJoinRoomId || roomsStatus === 'loading') return
    const room = allRooms.find(r => r.groupId === pendingJoinRoomId)
    onPendingJoinHandled?.()
    if (!room) { setNotice('That study room isn’t available. It may be invite-only or no longer exist.'); return }
    if (room.isMember) { onEnterRoom(room); return }
    enterAfterJoinRef.current = true
    void handleJoin(room)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoinRoomId, roomsStatus])

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

        {/* Community module tabs */}
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
            {([
              { id: 'rooms', label: 'Study Rooms' },
              { id: 'communities', label: 'Communities' },
            ] as { id: 'rooms' | 'communities'; label: string }[]).map(t => (
              <button key={t.id} onClick={() => setCommunityTab(t.id)}
                className="px-5 py-2 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: communityTab === t.id ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'transparent',
                  color: communityTab === t.id ? '#fff' : '#8B9AC7',
                  boxShadow: communityTab === t.id ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {communityTab === 'communities' ? (
            <CommunitiesTabContent communities={communities} status={communitiesStatus} error={communitiesError}
              onRefresh={onRefreshCommunities} onOpenCommunity={onOpenCommunity} />
          ) : (
          <>
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

          {notice && (
            <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl border text-[13px] text-amber-300"
              style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.25)' }}>
              <span>{notice}</span>
              <button onClick={() => setNotice(null)} className="text-amber-400/80 hover:text-amber-300 text-xs">Dismiss</button>
            </div>
          )}
          {roomsStatus === 'loading' && allRooms.length === 0 && (
            <div className="py-16 text-center text-slate-500 text-sm">Loading study rooms…</div>
          )}
          {roomsStatus === 'error' && allRooms.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-slate-300 font-semibold mb-1">Couldn't load study rooms</div>
              <div className="text-slate-500 text-sm mb-4">{roomsError}</div>
              <button onClick={() => void refreshRooms()}
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 bg-[#7C4DFF]">Try again</button>
            </div>
          )}
          {roomsStatus === 'ready' && tab !== 'myrooms' && filtered.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <div className="text-slate-300 font-semibold mb-1">{search ? 'No rooms match your search' : 'No study rooms here yet'}</div>
              <div className="text-slate-500 text-sm">Create one and invite your friends.</div>
            </div>
          )}

          <div className="space-y-3 pb-8">
            {filtered.map(room => {
              const joined = !!room.isMember
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
                            <button onClick={() => handleLeave(room)}
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
                      <button onClick={() => handleJoin(room)} disabled={busy}
                        className="px-5 py-2 rounded-full font-semibold text-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                        style={{ background: '#7C4DFF', color: '#fff', boxShadow: '0 0 18px rgba(40,85,204,0.6)' }}>
                        {room.isPublic ? 'Join' : '🔒 Join'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </>
          )}
        </main>
      </div>

      {/* Password Modal — Study Rooms tab only; unchanged from before */}
      {passwordRoomId !== null && (() => {
        const room = allRooms.find(r => r.id === passwordRoomId)
        if (!room) return null
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
                onChange={e => { setPasswordInput(e.target.value); setPasswordError(null) }}
                onKeyDown={e => e.key === 'Enter' && submitPassword()}
                autoFocus
              />
              {passwordError && <div className="text-[11px] text-red-400 text-center mb-3">{passwordError}</div>}
              {!passwordError && <div className="h-4 mb-1" />}
              <div className="flex gap-3">
                <button onClick={() => { setPasswordRoomId(null); enterAfterJoinRef.current = false }}
                  className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]"
                  >Cancel</button>
                <button onClick={submitPassword} disabled={busy}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
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
                  {inviteRoom.groupId ? roomInviteLink(inviteRoom.groupId).replace(/^https?:\/\//, '') : ''}
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
                <button key={opt.label} onClick={() => shareInvite(inviteRoom, opt.label)}
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
            {createError && <div className="text-[11px] text-red-400 text-center -mt-2 mb-3">{createError}</div>}
            <div className="flex gap-3">
              <button onClick={() => { setShowCreate(false); setCreateError(null) }}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]"
                >Cancel</button>
              <button onClick={handleCreateRoom} disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
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

// ─── Communities Tab ────────────────────────────────────────────────────────
// Real content for the "Communities" tab of the Community module:
//   1. Home Community hero — the user's primary community. Picking one
//      locks it for HOME_LOCK_DAYS; once the lock expires the same slot
//      turns into a "Change Home Community" pill instead of resetting to
//      empty, and whatever the user picks stays put (persisted) until they
//      deliberately change it again. Same "no backend table yet, so
//      localStorage is the source of truth" pattern as the Focus Lock plan
//      and Study Rooms membership elsewhere in this file.
//   2. "Your Communities" — every joined community other than the current
//      home one, in the same card language as the Study Rooms cards
//      (FaceAvatars, Joined badge, Open button). Grid wraps on its own, and
//      the page already scrolls (see `<main className="overflow-y-auto">`
//      in StudyRoomsPage), so a 4th/5th/6th community just flows below.
//   3. Discover More Communities — full-width CTA.
//   4. Join with Invite Link — full-width input + Join button.
const HOME_LOCK_DAYS = 30

// One community the signed-in user belongs to (my_communities, lib/communities.ts),
// in the shape the Communities cards and pages render.
interface CommunityData {
  id: string
  name: string
  members: number
  desc: string
  emoji: string
  iconBg: string
  studyingNow?: number
  avatarColors?: string[]
  avatarInits?: string[]
  avatarExtra?: number
  headName?: string
  myRole?: 'admin' | 'member'
  isHome?: boolean
  homeLockedUntil?: string | null
  inviteToken?: string | null
  joinRequiresApproval?: boolean
}

function communityLook(name: string): { iconBg: string } {
  const [c1, c2] = ROOM_GRADIENTS[hashSubject(name) % ROOM_GRADIENTS.length]
  return { iconBg: `linear-gradient(135deg,${c1},${c2})` }
}

function toCommunityData(r: MyCommunity): CommunityData {
  const inits = (r.preview_initials ?? []).filter(Boolean).slice(0, 4)
  return {
    id: r.id, name: r.name, members: r.member_count, desc: r.description?.trim() || 'Study together. Grow together.',
    emoji: r.emoji || '👥', ...communityLook(r.name), studyingNow: r.live_count,
    avatarColors: inits.map((x, i) => FACE_COLORS[(hashSubject(x) + i) % FACE_COLORS.length]), avatarInits: inits,
    avatarExtra: Math.max(0, r.member_count - inits.length),
    headName: r.head_name, myRole: r.my_role, isHome: !!r.is_home, homeLockedUntil: r.home_locked_until,
    inviteToken: r.invite_token, joinRequiresApproval: r.join_requires_approval,
  }
}

// A published community week from the database, made safe to render as ScheduleItem[][].
function normalizeWeek(raw: unknown): ScheduleItem[][] {
  const days = Array.isArray(raw) ? raw : []
  return Array.from({ length: 7 }, (_, i) => (Array.isArray(days[i]) ? days[i] : [])
    .filter((x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, j) => ({
      id: String(x.id ?? `s${i}_${j}`), subject: String(x.subject ?? 'Study'), topic: String(x.topic ?? ''),
      startTime: String(x.startTime ?? ''), endTime: String(x.endTime ?? ''),
      color: String(x.color ?? subjectColor(String(x.subject ?? ''))), iconEmoji: String(x.iconEmoji ?? subjectEmoji(String(x.subject ?? ''))),
    })))
}

const fmt = (n: number) => n.toLocaleString('en-US')

function joinStatusMessage(status: string): string {
  if (status === 'joined') return '✓ You joined the community.'
  if (status === 'requested') return '✓ Request sent — you\u2019ll join once the WynkoHead approves it.'
  if (status === 'already_member') return 'You’re already in this community.'
  if (status === 'full') return 'This community is full.'
  return 'That invite link or code isn’t valid.'
}

function CommunitiesTabContent({ communities, status, error, onRefresh, onOpenCommunity }: {
  communities: CommunityData[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
  onRefresh: () => Promise<void>
  onOpenCommunity: (c: CommunityData) => void
}) {
  // Home Community + its 30-day lock are stored per user (community_home) and
  // enforced server-side by rpc_set_home_community; half of the user's study
  // rewards follow it (compute_user_group_time_split, migration 0071).
  const [showPicker, setShowPicker] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showDiscover, setShowDiscover] = useState(false)
  const discoverQ = useLoader(showDiscover ? fetchDiscoverCommunities : null, [] as DiscoverCommunity[], [showDiscover], 0)
  const [discoverMsg, setDiscoverMsg] = useState<Record<string, string>>({})

  const joinedCommunities = communities
  const home = joinedCommunities.find(c => c.isHome) || null
  const homeCommunityId = home?.id ?? null
  const homeLockUntil = home?.homeLockedUntil ? new Date(home.homeLockedUntil).getTime() : null
  const daysRemaining = homeLockUntil ? Math.max(0, Math.ceil((homeLockUntil - Date.now()) / (1000 * 60 * 60 * 24))) : 0
  const isLocked = !!home && daysRemaining > 0
  const otherCommunities = joinedCommunities.filter(c => c.id !== homeCommunityId)

  async function selectHomeCommunity(id: string) {
    if (busy) return
    setBusy(true)
    setPickerError(null)
    try {
      await setHomeCommunity(id)
      await onRefresh()
      setShowPicker(false)
    } catch (e) {
      setPickerError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinInvite() {
    const token = parseInviteInput(inviteLink)
    if (!token || busy) return
    setBusy(true)
    try {
      const r = await joinCommunity({ token })
      setInviteMsg(joinStatusMessage(r.status))
      if (r.status === 'joined' || r.status === 'requested') setInviteLink('')
      if (r.status === 'joined') await onRefresh()
    } catch (e) {
      setInviteMsg((e as Error).message)
    } finally {
      setBusy(false)
      setTimeout(() => setInviteMsg(null), 5000)
    }
  }

  function handleExplore() {
    setShowDiscover(true)
  }

  async function joinFromDiscover(c: DiscoverCommunity) {
    if (busy) return
    setBusy(true)
    try {
      const r = await joinCommunity({ groupId: c.id })
      setDiscoverMsg(m => ({ ...m, [c.id]: joinStatusMessage(r.status) }))
      if (r.status === 'joined') await onRefresh()
      await discoverQ.refresh()
    } catch (e) {
      setDiscoverMsg(m => ({ ...m, [c.id]: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-8">
      {/* 1 · Home Community hero */}
      <div className="relative rounded-3xl border overflow-hidden p-6 sm:p-7 mb-7"
        style={{ borderColor: 'rgba(124,77,255,0.35)', boxShadow: '0 0 50px rgba(124,77,255,0.14)' }}>
        {/* Purple gradient base */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, #241356 0%, #3B2382 30%, #5B34B0 55%, #7C4DFF 78%, #4629A0 100%)' }} />
        {/* Mountain + flag silhouette, decorative, right side */}
        <svg viewBox="0 0 900 260" preserveAspectRatio="xMaxYMax slice" className="absolute inset-0 w-full h-full opacity-60 pointer-events-none" aria-hidden="true">
          <polygon points="480,260 560,150 610,190 680,110 760,180 830,140 900,200 900,260" fill="#1B0F45" opacity="0.55" />
          <polygon points="560,260 640,170 700,205 770,135 900,220 900,260" fill="#150A36" opacity="0.75" />
          <line x1="770" y1="135" x2="770" y2="95" stroke="#E8E2FF" strokeWidth="2" />
          <path d="M770,95 L804,105 L770,116 Z" fill="#E8E2FF" opacity="0.9" />
        </svg>
        {/* Readability overlay so text always sits on solid-enough ground */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(15,9,42,0.55) 0%, rgba(15,9,42,0.15) 55%, rgba(15,9,42,0.05) 100%)' }} />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[15px] flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>👑</div>
            <div className="text-white font-bold text-base">Home Community</div>
            {home && isLocked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: 'rgba(245,158,11,0.16)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.35)' }}>
                <Ico n="lock" cls="w-3 h-3" /> Locked for {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'}
              </span>
            )}
            {home && !isLocked && (
              <button onClick={() => setShowPicker(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors hover:opacity-80"
                style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }}>
                Change Home Community
              </button>
            )}
          </div>
          <div className="text-white/60 text-[13px] mb-5 max-w-md">
            Your primary community. 50% of your study rewards go here.
          </div>

          {home ? (
            <div className="flex items-end sm:items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: home.iconBg, boxShadow: '0 0 24px rgba(124,77,255,0.45)' }}>{home.emoji}</div>
                <div className="min-w-0">
                  <div className="text-white font-bold text-xl leading-tight mb-1 truncate">{home.name}</div>
                  <div className="flex items-center gap-1.5 text-white/75 text-[13px] mb-1">
                    <Ico n="rooms" cls="w-3.5 h-3.5" /> {fmt(home.members)} members
                  </div>
                  <div className="text-white/55 text-[13px]">{home.desc}</div>
                </div>
              </div>
              <button onClick={() => onOpenCommunity(home)}
                className="px-5 py-2.5 rounded-full bg-white text-[#2E1B6B] font-semibold text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity flex-shrink-0">
                View Community <Ico n="chevR" cls="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-white font-semibold text-base mb-1">No home community selected yet</div>
                <div className="text-white/55 text-[13px] max-w-sm">Pick one community as your home base — half of your study rewards go there.</div>
              </div>
              <button onClick={() => setShowPicker(true)}
                className="px-5 py-2.5 rounded-full bg-white text-[#2E1B6B] font-semibold text-sm hover:opacity-90 transition-opacity flex-shrink-0">
                Select Home Community
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2 · Your Communities */}
      <div className="mb-7">
        <div className="text-white font-bold text-base mb-0.5">Your Communities</div>
        <div className="text-slate-500 text-[13px] mb-4">
          {status === 'loading' && joinedCommunities.length === 0 ? 'Loading your communities…'
            : status === 'error' && joinedCommunities.length === 0 ? <>Couldn’t load your communities. <button onClick={() => void onRefresh()} className="text-violet-300 hover:text-violet-200">Try again</button>{error ? ` (${error})` : ''}</>
            : `You are part of ${otherCommunities.length} ${otherCommunities.length === 1 ? 'community' : 'communities'}${home ? ' besides your home' : ''}`}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {otherCommunities.map(c => (
            <div key={c.id} className="p-5 rounded-2xl border flex flex-col" style={{ background: '#0B1530', borderColor: '#1A2845', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: c.iconBg }}>{c.emoji}</div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0"
                  style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }}>Joined</span>
              </div>
              <div className="text-white font-bold text-[15px] mb-1 leading-snug">{c.name}</div>
              <div className="text-slate-500 text-[12px] mb-0.5">{fmt(c.members)} members</div>
              {typeof c.studyingNow === 'number' && (
                <div className="text-emerald-400 text-[12px] mb-4 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                  {fmt(c.studyingNow)} studying now
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {c.avatarColors && c.avatarInits && <FaceAvatars colors={c.avatarColors} inits={c.avatarInits} />}
                  {!!c.avatarExtra && <span className="text-[11px] text-slate-500 ml-0.5">+{c.avatarExtra}</span>}
                </div>
                <button onClick={() => onOpenCommunity(c)}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1 flex-shrink-0 hover:opacity-90 transition-opacity"
                  style={{ background: '#7C4DFF' }}>
                  Open <Ico n="chevR" cls="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 · Discover More Communities */}
      <div className="p-5 rounded-2xl border flex items-center justify-between gap-4 flex-wrap mb-4"
        style={{ background: '#0B1530', borderColor: '#1A2845', borderStyle: 'dashed' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(124,77,255,0.12)', border: '1px solid rgba(124,77,255,0.30)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-violet-300" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm">Discover More Communities</div>
            <div className="text-slate-500 text-[12px]">Find communities that match your goals or interests.</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <button onClick={handleExplore} className="px-5 py-2 rounded-full text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ background: '#7C4DFF', boxShadow: '0 0 16px rgba(124,77,255,0.4)' }}>
            Explore <Ico n="chevR" cls="w-3.5 h-3.5" />
          </button>

        </div>
      </div>

      {/* 4 · Join with Invite Link */}
      <div className="p-5 rounded-2xl border flex items-center justify-between gap-4 flex-wrap"
        style={{ background: '#0B1530', borderColor: '#1A2845', borderStyle: 'dashed' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.30)' }}>🔗</div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm">Join with Invite Link</div>
            <div className="text-slate-500 text-[12px]">Have an invite link or code? Join a community directly.</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text" placeholder="Enter invite link or code" value={inviteLink}
              onChange={e => setInviteLink(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleJoinInvite()}
              className="w-56 px-4 py-2 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 transition-colors focus:border-violet-500/50"
              style={{ borderColor: '#1E3060' }} />
            <button onClick={() => void handleJoinInvite()} disabled={busy}
              className="px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0 disabled:opacity-60"
              style={{ background: '#7C4DFF' }}>
              Join
            </button>
          </div>
          {inviteMsg && <div className={`text-[11px] ${inviteMsg.startsWith('✓') ? 'text-emerald-400' : 'text-amber-300'}`}>{inviteMsg}</div>}
        </div>
      </div>

      {/* Home Community picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]"
          onClick={e => { if (e.target === e.currentTarget) setShowPicker(false) }}>
          <div className="rounded-2xl border p-7 w-[400px] max-h-[80vh] overflow-y-auto"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
            <div className="text-center mb-5">
              <div className="text-2xl mb-2">👑</div>
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-0.5">HOME COMMUNITY</div>
              <div className="text-lg font-bold text-white">{home ? 'Change your home community' : 'Select your home community'}</div>
              <div className="text-slate-500 text-[12px] mt-1">You can only change this once every {HOME_LOCK_DAYS} days.</div>
            </div>
            {pickerError && <div className="text-[12px] text-amber-300 text-center mb-3">{pickerError}</div>}
            {joinedCommunities.length === 0 && (
              <div className="text-[13px] text-slate-400 text-center mb-5">Join a community first — use an invite link or Explore below.</div>
            )}
            <div className="space-y-2 mb-5">
              {joinedCommunities.map(c => (
                <button key={c.id} onClick={() => void selectHomeCommunity(c.id)} disabled={busy}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:border-violet-500/40"
                  style={{
                    background: c.id === homeCommunityId ? 'rgba(124,77,255,0.12)' : 'rgba(14,21,40,0.55)',
                    borderColor: c.id === homeCommunityId ? 'rgba(124,77,255,0.5)' : 'rgba(124,58,237,0.16)',
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: c.iconBg }}>{c.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-100 truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-500">{fmt(c.members)} members</div>
                  </div>
                  {c.id === homeCommunityId && <Ico n="check" cls="w-4 h-4 text-violet-300 flex-shrink-0" />}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowPicker(false); setPickerError(null) }}
              className="w-full py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Discover communities (Explore) - same modal language as the picker above */}
      {showDiscover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]"
          onClick={e => { if (e.target === e.currentTarget) setShowDiscover(false) }}>
          <div className="rounded-2xl border p-7 w-[440px] max-h-[80vh] overflow-y-auto"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
            <div className="text-center mb-5">
              <div className="text-2xl mb-2">🧭</div>
              <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-0.5">DISCOVER</div>
              <div className="text-lg font-bold text-white">Communities you can join</div>
              <div className="text-slate-500 text-[12px] mt-1">Run by verified WynkoHeads.</div>
            </div>
            {discoverQ.status === 'loading' && <div className="text-[13px] text-slate-500 text-center py-6">Loading communities…</div>}
            {discoverQ.status === 'error' && <div className="text-[13px] text-amber-300 text-center py-6">{discoverQ.error}</div>}
            {discoverQ.status === 'ready' && discoverQ.data.length === 0 && (
              <div className="text-[13px] text-slate-500 text-center py-6">No other communities to join right now.</div>
            )}
            <div className="space-y-2 mb-5">
              {discoverQ.data.map(c => (
                <div key={c.id} className="p-3 rounded-xl border" style={{ background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(124,58,237,0.16)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: communityLook(c.name).iconBg }}>{c.emoji || '👥'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{fmt(c.member_count)} members · by {c.head_name}</div>
                    </div>
                    <button onClick={() => void joinFromDiscover(c)} disabled={busy || c.requested}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0 hover:opacity-90 transition-opacity disabled:opacity-50"
                      style={{ background: '#7C4DFF' }}>
                      {c.requested ? 'Requested' : c.join_requires_approval ? 'Request' : 'Join'}
                    </button>
                  </div>
                  {discoverMsg[c.id] && <div className="text-[11px] text-emerald-400 mt-2">{discoverMsg[c.id]}</div>}
                </div>
              ))}
            </div>
            <button onClick={() => setShowDiscover(false)}
              className="w-full py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Community · Student View ────────────────────────────────────────────────
// What a student sees after opening a community from the Communities tab
// ("View Community" / "Open"): a focused study space run by that community's
// WynkoHead — header, four tabs (Home · Schedule · My Progress · Announcements)
// and nothing else. No revenue/earnings anywhere on this page by design.
//
// Data is live: community_detail (my progress in this community, community
// stats, head) and community_announcements (realtime). The Accept / Reject
// decision on the WynkoHead's published schedule lives in the App root (it has
// to write the student's actual schedule) and is saved per user
// (community_schedule_choices) via rpc_set_schedule_choice.
type CommunityStudentTab = 'home' | 'schedule' | 'progress' | 'announcements'
type CommunityScheduleChoice = ScheduleChoice

// What the community page renders, built from community_detail +
// community_announcements (lib/communities.ts).
interface CommunityHead { name: string; initials: string; color: string }
interface CommunityAnnouncement { id: string; title: string; message: string; postedAt: number; pinned?: boolean; important?: boolean }
interface CommunityDetail {
  head: CommunityHead
  studyingNow: number
  announcements: CommunityAnnouncement[]
  progress: {
    todayMinutes: number; todaySessions: number; adherencePct: number | null
    totalMinutes: number; totalSessions: number; weeklyMinutes: number[]
    community: { avgDailyMinutes: number; activeSubjects: number; avgAdherencePct: number | null }
  }
}
const HEAD_AVATAR_GRADIENT = 'linear-gradient(135deg,#7C4DFF,#4C2E9E)'
const pctText = (n: number | null | undefined) => (n == null ? '–' : `${n}%`)

function toAnnouncement(a: CommunityAnnouncementRow): CommunityAnnouncement {
  return { id: a.id, title: a.title, message: a.message, postedAt: new Date(a.created_at).getTime(), pinned: a.pinned, important: a.important }
}

function toCommunityDetail(d: CommunityDetailData, anns: CommunityAnnouncementRow[]): CommunityDetail {
  const weekly = Array.from({ length: 7 }, (_, i) => Number(d.my.weekly_minutes?.[i]) || 0)
  return {
    head: { name: d.head.name, initials: initialsOf(d.head.name), color: HEAD_AVATAR_GRADIENT },
    studyingNow: d.studying_now,
    announcements: anns.map(toAnnouncement),
    progress: {
      todayMinutes: d.my.today_minutes, todaySessions: d.my.today_sessions, adherencePct: d.my.adherence,
      totalMinutes: d.my.total_minutes, totalSessions: d.my.total_sessions, weeklyMinutes: weekly,
      community: { avgDailyMinutes: d.stats.avg_daily_minutes, activeSubjects: d.stats.active_subjects, avgAdherencePct: d.stats.avg_adherence },
    },
  }
}

// Shared look for every block on this page — the same gradient card, icon tile
// and inner row already used by Home's Today's Study Plan.
const CM_CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg, #0C1631 0%, #090E20 100%)',
  borderColor: 'rgba(56,132,255,0.26)',
  boxShadow: '0 0 50px rgba(41,98,255,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
}
const CM_TILE: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(41,98,255,0.25), rgba(124,77,255,0.20))',
  border: '1px solid rgba(56,132,255,0.4)',
  boxShadow: '0 0 14px rgba(41,98,255,0.3)',
}
const CM_ROW: React.CSSProperties = { background: 'rgba(14,21,40,0.55)', borderColor: 'rgba(26,40,69,0.6)' }

function formatPostedStamp(ts: number): string {
  const d = new Date(ts), now = new Date()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((dayStart(now) - dayStart(d)) / 86400000)
  if (dayDiff === 0) return `Today, ${time}`
  if (dayDiff === 1) return `Yesterday, ${time}`
  const date = d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date}, ${time}`
}

function formatPostedAgo(ts: number): string {
  const mins = Math.floor(Math.max(0, Date.now() - ts) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatPostedStamp(ts)
}

const weekSessionMins = (day: ScheduleItem[]) => day.reduce((n, s) => n + parseTimeRangeMinutes(s.startTime, s.endTime), 0)

// True when every weekday has the same sessions (the seed schedule repeats daily).
function weekIsUniform(week: ScheduleItem[][]): boolean {
  const sig = (d: ScheduleItem[]) => d.map(s => `${s.subject}|${s.topic}|${s.startTime}|${s.endTime}`).join(';')
  return week.every(d => sig(d) === sig(week[0]))
}

// "4h 30m/day · 3 sessions", or per week when the days differ.
function weekSummary(week: ScheduleItem[][]): string {
  const uniform = weekIsUniform(week)
  const sessions = uniform ? week[0].length : week.reduce((n, d) => n + d.length, 0)
  const mins = uniform ? weekSessionMins(week[0]) : week.reduce((n, d) => n + weekSessionMins(d), 0)
  return `${formatStudyDuration(mins)}/${uniform ? 'day' : 'week'} · ${sessions} session${sessions === 1 ? '' : 's'}${uniform ? '' : '/week'}`
}

// Purple gradient + mountain/flag art shared by the student and WynkoHead
// community headers, faded in from the right so the text side stays on the card colour.
function CommunityBannerArt() {
  return (
    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
      <div className="absolute inset-y-0 right-0 w-[62%]"
        style={{
          background: 'linear-gradient(115deg, #241356 0%, #3B2382 30%, #5B34B0 58%, #7C4DFF 85%, #4629A0 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 55%)',
          maskImage: 'linear-gradient(to right, transparent 0%, #000 55%)',
        }}>
        <svg viewBox="0 0 700 132" preserveAspectRatio="xMaxYMax slice" className="absolute inset-0 w-full h-full opacity-60" aria-hidden="true">
          <polygon points="140,132 230,62 285,96 380,40 470,86 545,58 700,104 700,132" fill="#1B0F45" opacity="0.55" />
          <polygon points="250,132 340,78 405,104 490,54 700,112 700,132" fill="#150A36" opacity="0.75" />
          <line x1="490" y1="54" x2="490" y2="22" stroke="#E8E2FF" strokeWidth="2" />
          <path d="M490,22 L522,30 L490,39 Z" fill="#E8E2FF" opacity="0.9" />
        </svg>
      </div>
    </div>
  )
}

// A community's shared study room: the community's own group, opened in the
// same room interior as every Study Room (real members, chat, sessions that
// count toward the community).
function communityStudyRoom(community: CommunityData): RoomData {
  const shortName = community.name.split('—').pop()!.trim()
  return {
    id: community.id, groupId: community.id, isMember: true, name: `${shortName} Study Room`, emoji: '', classes: 'Community',
    subject: 'All Subjects', desc: community.desc, members: community.members,
    avatarColors: community.avatarColors ?? [], avatarInits: community.avatarInits ?? [],
    iconBg: community.iconBg, iconEmoji: community.emoji,
    tag: 'all', isPublic: true, subjectTag: 'all', memberLimit: 5000, liveCount: community.studyingNow,
  }
}

function CommunityHeadAvatar({ head, size = 40 }: { head: CommunityHead; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none"
      style={{
        width: size, height: size, background: head.color, fontSize: Math.round(size * 0.34),
        border: '1.5px solid rgba(124,77,255,0.45)', boxShadow: '0 0 14px rgba(124,77,255,0.35)',
      }}>
      {head.initials}
    </div>
  )
}

function WynkoHeadTag() {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0"
      style={{ background: 'rgba(124,77,255,0.14)', color: '#C4AAFF', border: '1px solid rgba(124,77,255,0.35)' }}>
      👑 WynkoHead
    </span>
  )
}

function AnnouncementBadges({ pinned, important }: { pinned?: boolean; important?: boolean }) {
  if (!pinned && !important) return null
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {pinned && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(56,132,255,0.12)', color: '#7FB0FF', border: '1px solid rgba(56,132,255,0.30)' }}>
          <Ico n="pin" cls="w-3 h-3" /> Pinned
        </span>
      )}
      {important && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.30)' }}>
          <Ico n="alert" cls="w-3 h-3" /> Important
        </span>
      )}
    </div>
  )
}

function CmCardTitle({ icon, title, sub, right }: { icon: keyof typeof IP; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={CM_TILE}>
          <Ico n={icon} cls="w-4 h-4 text-cyan-300" />
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-slate-100 leading-tight" style={{ fontFamily: 'Poppins, sans-serif' }}>{title}</div>
          {sub && <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  )
}

// One icon + value + label cell, used for the Your Progress strip and the
// community statistics strip.
function CmStat({ icon, value, label }: { icon: keyof typeof IP; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(41,98,255,0.14)', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 12px rgba(41,98,255,0.35)' }}>
        <Ico n={icon} cls="w-4 h-4 text-cyan-300" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-slate-100 leading-tight">{value}</div>
        <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  )
}

const compactCount = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function CommunityStudentPage({ community, isHome, isOwner = false, week, weekBy, onBack, onNavigate, onJoinRoom, onLeave, profile, scheduleChoice, onAcceptSchedule, onRejectSchedule }: {
  community: CommunityData
  isHome: boolean
  isOwner?: boolean // the WynkoHead previewing their own community
  week: ScheduleItem[][] | null // the WynkoHead's published schedule (null = none published yet)
  weekBy: string | null // who published it
  onBack: () => void
  onNavigate: (id: string) => void
  onJoinRoom: (room: RoomData) => void
  onLeave: () => void
  profile?: ProfileInfo
  scheduleChoice: CommunityScheduleChoice | null
  onAcceptSchedule: () => void
  onRejectSchedule: () => void
}) {
  // Everything below is live data: community_detail (progress, stats, head)
  // and the announcement feed, which updates in realtime when the WynkoHead posts.
  const detailQ = useLoader(() => fetchCommunityDetail(community.id), null as CommunityDetailData | null, [community.id])
  const annQ = useLoader(() => fetchAnnouncements(community.id), [] as CommunityAnnouncementRow[], [community.id])
  useRealtimeRefresh('community_announcements', `group_id=eq.${community.id}`, () => { void annQ.refresh() })
  const detail = useMemo(() => (detailQ.data ? toCommunityDetail(detailQ.data, annQ.data) : null), [detailQ.data, annQ.data])
  const [tab, setTab] = useState<CommunityStudentTab>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const TABS: { id: CommunityStudentTab; label: string; icon: keyof typeof IP }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'progress', label: 'My Progress', icon: 'progress' },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
  ]

  const studyingNow = detail?.studyingNow ?? community.studyingNow ?? 0
  const members = detailQ.data?.member_count ?? community.members
  const faces = { colors: community.avatarColors ?? [], inits: community.avatarInits ?? [] }

  // The community's shared study room opens in the same room interior every
  // other Study Room uses.
  function joinCommunityRoom() { onJoinRoom(communityStudyRoom(community)) }

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]">
      <Sidebar active="studyrooms" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5">COMMUNITY</div>
            <div className="text-sm font-semibold text-slate-200">Student View</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4 pb-6">
            {/* 1 · Community header */}
            <div className="relative rounded-2xl border" style={{ ...CM_CARD, borderColor: 'rgba(56,132,255,0.30)', boxShadow: '0 0 70px rgba(41,98,255,0.14), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <CommunityBannerArt />

              <div className="relative z-10 p-5 flex items-center gap-4">
                <button onClick={onBack} aria-label="Back to communities"
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-slate-300 hover:text-white transition-colors"
                  style={{ background: 'rgba(14,21,40,0.7)', border: '1px solid rgba(56,132,255,0.30)' }}>
                  <Ico n="chevL" cls="w-4 h-4" />
                </button>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ background: community.iconBg, boxShadow: '0 0 24px rgba(124,77,255,0.45)' }}>{community.emoji}</div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-white leading-tight truncate">{community.name}</h1>
                  <div className="flex items-center gap-1.5 text-[13px] mt-1" style={{ color: '#A5B4FC' }}>
                    <Ico n="rooms" cls="w-3.5 h-3.5" /> {fmt(members)} members
                  </div>
                  <div className="flex items-center gap-2 mt-2.5">
                    <FaceAvatars colors={faces.colors} inits={faces.inits} />
                    {members > faces.inits.length && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-slate-200"
                        style={{ background: 'rgba(14,21,40,0.7)', border: '1px solid rgba(56,132,255,0.30)' }}>
                        +{compactCount(members - faces.inits.length)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative self-start flex-shrink-0">
                  <button onClick={() => setMenuOpen(o => !o)} aria-label="Community options" aria-haspopup="menu" aria-expanded={menuOpen}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-200 hover:text-white transition-colors"
                    style={{ background: 'rgba(14,21,40,0.55)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <Ico n="dots" cls="w-5 h-5" />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div role="menu" className="absolute right-0 top-full mt-2 w-60 rounded-xl border p-1.5 z-40"
                        style={{ background: '#0B1530', borderColor: '#1E3060', boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(41,98,255,0.15)' }}>
                        <button role="menuitem" disabled={isHome || isOwner}
                          onClick={() => { setMenuOpen(false); setConfirmLeave(true) }}
                          className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors enabled:hover:bg-red-500/10 disabled:cursor-not-allowed"
                          style={{ color: isHome || isOwner ? '#4E5E84' : '#F87171' }}>
                          Leave community
                          {isOwner
                            ? <div className="text-[11px] font-normal text-slate-500 mt-0.5">You manage this community.</div>
                            : isHome && <div className="text-[11px] font-normal text-slate-500 mt-0.5">This is your Home Community. Change it first.</div>}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 2 · Tabs */}
            <div role="tablist" className="grid grid-cols-4 gap-1 p-1 rounded-2xl border" style={{ background: '#0B1530', borderColor: '#1A2845' }}>
              {TABS.map(t => {
                const active = tab === t.id
                return (
                  <button key={t.id} role="tab" aria-selected={active} onClick={() => setTab(t.id)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: active ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'transparent',
                      color: active ? '#fff' : '#8B9AC7',
                      boxShadow: active ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
                    }}>
                    <Ico n={t.icon} cls="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* 3 · Tab content */}
            {!detail ? (
              <div className="p-10 rounded-2xl border text-center" style={CM_CARD}>
                {detailQ.status === 'error' ? (
                  <>
                    <div className="text-sm font-semibold text-slate-300 mb-1">Couldn’t load this community</div>
                    <div className="text-[12px] text-slate-500 mb-4">{detailQ.error}</div>
                    <button onClick={() => void detailQ.refresh()} className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white" style={{ background: '#7C4DFF' }}>Try again</button>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Loading community…</div>
                )}
              </div>
            ) : tab === 'home' ? (
              <CommunityHomeTab detail={detail} studyingNow={studyingNow} faces={faces}
                onViewAll={() => setTab('announcements')} onJoinRoom={joinCommunityRoom} />
            ) : tab === 'schedule' ? (
              week ? (
                <CommunityScheduleTab week={week} head={detail.head} by={weekBy ?? detail.head.name} choice={scheduleChoice}
                  onAccept={onAcceptSchedule} onReject={onRejectSchedule} onCreateOwn={() => onNavigate('schedules')} />
              ) : (
                <div className="p-10 rounded-2xl border text-center" style={CM_CARD}>
                  <div className="text-sm font-semibold text-slate-300 mb-1">No schedule yet</div>
                  <div className="text-[12px] text-slate-500">{detail.head.name} hasn’t published a community schedule yet. You’ll get a notification when they do.</div>
                </div>
              )
            ) : tab === 'progress' ? (
              <CommunityProgressTab detail={detail} />
            ) : (
              <CommunityAnnouncementsTab detail={detail} />
            )}
          </div>
        </main>
      </div>

      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)]"
          onClick={e => { if (e.target === e.currentTarget) setConfirmLeave(false) }}>
          <div className="rounded-2xl border p-7 w-[380px]"
            style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
            <div className="text-lg font-bold text-white mb-1.5">Leave {community.name}?</div>
            <div className="text-[13px] text-slate-400 mb-5 leading-relaxed">
              You’ll lose access to this community’s schedule, study room and announcements. You can rejoin later with an invite link.
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmLeave(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">Cancel</button>
              <button onClick={() => { setConfirmLeave(false); onLeave() }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: '#DC2626' }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Home tab: latest announcement + study room, then this community's progress ──
function CommunityHomeTab({ detail, studyingNow, faces, onViewAll, onJoinRoom }: {
  detail: CommunityDetail
  studyingNow: number
  faces: { colors: string[]; inits: string[] }
  onViewAll: () => void
  onJoinRoom: () => void
}) {
  const latest = [...detail.announcements].sort((a, b) => b.postedAt - a.postedAt)[0]
  const p = detail.progress
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch">
        {/* Announcements */}
        <div className="p-5 rounded-2xl border h-full flex flex-col" style={CM_CARD}>
          <CmCardTitle icon="megaphone" title="Announcements"
            right={
              <button onClick={onViewAll} className="flex items-center gap-1 text-[12px] font-semibold text-[#5B9BFF] hover:text-[#8DBBFF] transition-colors flex-shrink-0">
                View All <Ico n="arrow" cls="w-3.5 h-3.5" />
              </button>
            } />
          {latest ? (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-3 mb-3.5">
                <CommunityHeadAvatar head={detail.head} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-100">{detail.head.name}</span>
                    <WynkoHeadTag />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                    <Ico n="clock" cls="w-3 h-3" /> {formatPostedAgo(latest.postedAt)}
                  </div>
                </div>
                <AnnouncementBadges pinned={latest.pinned} important={latest.important} />
              </div>
              <div className="rounded-xl border p-4 flex-1" style={CM_ROW}>
                <div className="text-sm font-semibold text-slate-100 mb-1">{latest.title}</div>
                <div className="text-[13px] text-slate-400 leading-relaxed">{latest.message}</div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-slate-500 py-8">No announcements yet.</div>
          )}
        </div>

        {/* Community Study Room */}
        <div className="p-5 rounded-2xl border h-full flex flex-col" style={CM_CARD}>
          <CmCardTitle icon="rooms" title="Community Study Room"
            right={studyingNow > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} /> Live
              </span>
            ) : undefined} />
          <div className="flex-1 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <FaceAvatars colors={faces.colors.slice(0, 3)} inits={faces.inits.slice(0, 3)} />
                <div className="text-[13px] text-slate-300 font-medium">
                  <span className="text-slate-100 font-semibold">{fmt(studyingNow)}</span> students studying
                </div>
              </div>
              <p className="text-[13px] text-slate-400 leading-relaxed max-w-[280px]">
                Join the common study room and stay focused together with your community.
              </p>
            </div>
            <div className="hidden xl:flex w-24 h-24 rounded-full items-center justify-center flex-shrink-0"
              style={{ border: '1px dashed rgba(124,77,255,0.35)', background: 'radial-gradient(circle, rgba(124,77,255,0.14) 0%, transparent 70%)' }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(41,98,255,0.14)', border: '1px solid rgba(56,132,255,0.4)', boxShadow: '0 0 20px rgba(41,98,255,0.35)' }}>
                <Ico n="rooms" cls="w-6 h-6 text-cyan-300" />
              </div>
            </div>
          </div>
          <button onClick={onJoinRoom}
            className="mt-5 w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
            Join Room <Ico n="arrow" cls="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Your Progress (This Community) */}
      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="progress" title="Your Progress" sub="This community" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x sm:divide-[rgba(26,40,69,0.9)]">
          <div className="sm:pr-6"><CmStat icon="clock" value={formatStudyDuration(p.todayMinutes)} label="Study Time Today" /></div>
          <div className="sm:px-6"><CmStat icon="bullseye" value={String(p.todaySessions)} label="Focus Sessions" /></div>
          <div className="sm:pl-6"><CmStat icon="check" value={pctText(p.adherencePct)} label="Schedule Adherence" /></div>
        </div>
      </div>
    </div>
  )
}

// ── Schedule tab: the WynkoHead's schedule + the student's accept / reject decision ──
function CommunityScheduleTab({ week, head, by, choice, onAccept, onReject, onCreateOwn }: {
  week: ScheduleItem[][]
  head: CommunityHead
  by: string
  choice: CommunityScheduleChoice | null
  onAccept: () => void
  onReject: () => void
  onCreateOwn: () => void
}) {
  const uniform = weekIsUniform(week)
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()
  const [day, setDay] = useState(todayIdx)
  const shown = uniform ? (week[0] ?? []) : (week[day] ?? [])
  const shownMins = weekSessionMins(shown)
  const ghostBtn = 'px-5 py-2.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 transition-colors border'
  return (
    <div className="space-y-3.5">
      {/* Decision card */}
      <div className="p-5 rounded-2xl border relative overflow-hidden"
        style={{ ...CM_CARD, borderColor: choice === 'accepted' ? 'rgba(25,211,162,0.35)' : 'rgba(56,132,255,0.30)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${choice === 'accepted' ? 'rgba(25,211,162,0.10)' : 'rgba(41,98,255,0.12)'} 0%, transparent 65%)`, transform: 'translate(25%,-40%)' }} />
        <div className="relative flex items-start gap-4 flex-wrap">
          <CommunityHeadAvatar head={{ ...head, name: by, initials: initialsOf(by) }} size={48} />
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <div className="text-lg font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Community Schedule</div>
              {choice === 'accepted' && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold"
                  style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.35)' }}>
                  <Ico n="check" cls="w-3.5 h-3.5" /> Following Community Schedule
                </span>
              )}
              {choice === 'rejected' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold"
                  style={{ background: 'rgba(124,77,255,0.14)', color: '#C4AAFF', border: '1px solid rgba(124,77,255,0.35)' }}>
                  You’re using your own schedule
                </span>
              )}
            </div>
            <div className="text-[13px] text-slate-400 leading-relaxed">
              {choice === 'accepted'
                ? 'This is now your study schedule. It also shows up in Schedules and Today’s Study Plan.'
                : choice === 'rejected'
                  ? 'You’re not following this community’s schedule. You can change your mind any time.'
                  : 'Your WynkoHead has created a study schedule for this community.'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">By {by} · {weekSummary(week)}</div>
          </div>
        </div>

        <div className="relative flex items-center gap-3 flex-wrap mt-5">
          {choice === null && (
            <>
              <button onClick={onAccept}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#19D3A2,#0DAE86)', boxShadow: '0 0 20px rgba(25,211,162,0.35)' }}>
                <Ico n="check" cls="w-4 h-4" /> Accept Schedule
              </button>
              <button onClick={onReject}
                className={`${ghostBtn} text-slate-200 hover:text-white hover:border-[rgba(56,132,255,0.6)]`}
                style={{ background: 'rgba(41,98,255,0.08)', borderColor: 'rgba(56,132,255,0.35)' }}>
                <Ico n="close" cls="w-4 h-4" /> Reject &amp; Create My Own
              </button>
            </>
          )}
          {choice === 'accepted' && (
            <button onClick={onReject}
              className={`${ghostBtn} text-slate-300 hover:text-white hover:border-[rgba(56,132,255,0.6)]`}
              style={{ background: 'rgba(41,98,255,0.08)', borderColor: 'rgba(56,132,255,0.35)' }}>
              <Ico n="close" cls="w-4 h-4" /> Reject &amp; Create My Own
            </button>
          )}
          {choice === 'rejected' && (
            <>
              <button onClick={onCreateOwn}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
                Create My Schedule <Ico n="arrow" cls="w-4 h-4" />
              </button>
              <button onClick={onAccept}
                className={`${ghostBtn} text-slate-300 hover:text-white hover:border-[rgba(25,211,162,0.6)]`}
                style={{ background: 'rgba(25,211,162,0.06)', borderColor: 'rgba(25,211,162,0.30)' }}>
                <Ico n="check" cls="w-4 h-4" /> Accept Schedule instead
              </button>
            </>
          )}
        </div>
      </div>

      {/* The schedule itself: time + subject */}
      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="calendar" title="Schedule" sub={uniform ? 'Repeats every day' : 'Weekly schedule'}
          right={<div className="text-xs text-slate-500 flex-shrink-0">{formatStudyDuration(shownMins)} {uniform ? 'total' : `on ${DAYS_SHORT[day]}`}</div>} />
        {!uniform && (
          <div className="flex gap-1.5 mb-3.5">
            {DAYS_SHORT.map((d, i) => (
              <button key={d} onClick={() => setDay(i)} aria-pressed={day === i}
                className="flex-1 flex flex-col items-center py-2 rounded-xl transition-all"
                style={{
                  background: day === i ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : '#0B1530',
                  border: `1px solid ${day === i ? '#563FA0' : 'rgba(26,40,69,0.55)'}`,
                  boxShadow: day === i ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
                }}>
                <span className="text-[11px] font-semibold" style={{ color: day === i ? '#fff' : '#8B9AC7' }}>{d}</span>
                <span className="text-[10px]" style={{ color: day === i ? 'rgba(255,255,255,0.75)' : '#4E5E84' }}>{week[i]?.length ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        {shown.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-slate-500">No sessions on {DAYS_SHORT[day]}.</div>
        ) : (
          <div className="space-y-2">
            {shown.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={CM_ROW}>
                <div className="w-[150px] flex-shrink-0 text-[12px] font-semibold text-slate-300 whitespace-nowrap" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {s.startTime} – {s.endTime}
                </div>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                  style={{ background: `${s.color}1A`, border: `1px solid ${s.color}44` }}>{s.iconEmoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">{s.subject}</div>
                  <div className="text-[11px] text-slate-500 truncate">{s.topic}</div>
                </div>
                <div className="text-[11px] text-slate-500 flex-shrink-0">{formatStudyDuration(parseTimeRangeMinutes(s.startTime, s.endTime))}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Last-7-days bars for this community only. Y-axis in whole hours, same
// scale rule as the Home study-progress graph (ticks derived from the data).
function CommunityWeeklyBars({ minutes }: { minutes: number[] }) {
  const days = useMemo(() => minutes.map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (minutes.length - 1 - i))
    return { label: d.toLocaleDateString('en-US', { weekday: 'short' }), isToday: i === minutes.length - 1 }
  }), [minutes])
  const maxHours = Math.max(1, Math.ceil(Math.max(...minutes, 60) / 60))
  const step = Math.max(1, Math.ceil(maxHours / 4))
  const topHours = Math.ceil(maxHours / step) * step
  const yMax = topHours * 60
  const ticks: number[] = []
  for (let h = 0; h <= topHours; h += step) ticks.push(h)

  return (
    <div>
      <div className="pt-6">
        <div className="relative h-44">
          {ticks.map(h => (
            <div key={h} className="absolute left-0 right-0 flex items-center" style={{ bottom: `${(h / topHours) * 100}%`, transform: 'translateY(50%)' }}>
              <span className="w-10 text-[10px] text-slate-600 text-right pr-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{h}h</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(139,154,199,0.10)' }} />
            </div>
          ))}
          <div className="absolute top-0 bottom-0 left-10 right-0 flex items-end gap-3">
            {minutes.map((m, i) => (
              <div key={i} className="flex-1 h-full flex items-end justify-center">
                <div className="relative w-full max-w-[44px] rounded-t-lg"
                  title={`${days[i].label}: ${formatStudyDuration(m)}`}
                  style={{
                    height: `${(m / yMax) * 100}%`, minHeight: m > 0 ? 4 : 0,
                    background: days[i].isToday ? 'linear-gradient(180deg,#22D3EE,#2979FF)' : 'linear-gradient(180deg,#7C4DFF,#3B2FA8)',
                    boxShadow: days[i].isToday ? '0 0 18px rgba(34,211,238,0.35)' : 'none',
                  }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">{formatStudyDuration(m)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-3 pl-10 mt-2">
        {days.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[11px]" style={{ color: d.isToday ? '#67E8F9' : '#64748B', fontWeight: d.isToday ? 600 : 400 }}>{d.label}</div>
        ))}
      </div>
    </div>
  )
}

// ── My Progress tab: this community only ──
function CommunityProgressTab({ detail }: { detail: CommunityDetail }) {
  const p = detail.progress
  const weekTotal = p.weeklyMinutes.reduce((a, b) => a + b, 0)
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {([
          { icon: 'clock', value: formatStudyDuration(p.totalMinutes), label: 'Total Study Time' },
          { icon: 'bullseye', value: String(p.totalSessions), label: 'Focus Sessions' },
          { icon: 'check', value: pctText(p.adherencePct), label: 'Schedule Adherence' },
        ] as { icon: keyof typeof IP; value: string; label: string }[]).map(s => (
          <div key={s.label} className="p-5 rounded-2xl border" style={CM_CARD}>
            <CmStat icon={s.icon} value={s.value} label={s.label} />
          </div>
        ))}
      </div>

      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="progress" title="Weekly Study Activity" sub="Last 7 days · this community"
          right={<div className="text-right flex-shrink-0"><div className="text-sm font-bold text-slate-100">{formatStudyDuration(weekTotal)}</div><div className="text-[10px] text-slate-500">this week</div></div>} />
        <CommunityWeeklyBars minutes={p.weeklyMinutes} />
      </div>

      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="rooms" title="Community Statistics" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x sm:divide-[rgba(26,40,69,0.9)]">
          <div className="sm:pr-6"><CmStat icon="clock" value={formatStudyDuration(p.community.avgDailyMinutes)} label="Avg. Study Time / Day" /></div>
          <div className="sm:px-6"><CmStat icon="library" value={String(p.community.activeSubjects)} label="Active Subjects" /></div>
          <div className="sm:pl-6"><CmStat icon="check" value={pctText(p.community.avgAdherencePct)} label="Avg. Schedule Adherence" /></div>
        </div>
      </div>
    </div>
  )
}

// ── Announcements tab: the WynkoHead's feed, pinned first then newest → oldest ──
function CommunityAnnouncementsTab({ detail }: { detail: CommunityDetail }) {
  const feed = [...detail.announcements].sort((a, b) =>
    (Number(!!b.pinned) - Number(!!a.pinned)) || (b.postedAt - a.postedAt))
  if (feed.length === 0) {
    return (
      <div className="p-10 rounded-2xl border text-center" style={CM_CARD}>
        <div className="text-sm font-semibold text-slate-300 mb-1">No announcements yet</div>
        <div className="text-[12px] text-slate-500">Announcements from {detail.head.name} will show up here.</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {feed.map(a => (
        <div key={a.id} className="p-5 rounded-2xl border" style={CM_CARD}>
          <div className="flex items-start gap-3.5">
            <CommunityHeadAvatar head={detail.head} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm font-semibold text-slate-100">{detail.head.name}</span>
                  <WynkoHeadTag />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <AnnouncementBadges pinned={a.pinned} important={a.important} />
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                    <Ico n="clock" cls="w-3 h-3" /> {formatPostedStamp(a.postedAt)}
                  </span>
                </div>
              </div>
              <div className="text-[15px] font-semibold text-slate-100 mt-2.5 mb-1">{a.title}</div>
              <div className="text-[13px] text-slate-400 leading-relaxed">{a.message}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── WynkoHead · Community management ────────────────────────────────────────
// What a registered WynkoHead sees when they open Community from the sidebar,
// instead of the student's Study Rooms / Communities module: a management
// dashboard for the community they run. Tabs: Overview · Schedule ·
// Announcements · Student Analytics · Earnings · Manage Community.
//
// The student side of the same flows lives in CommunityStudentPage above:
// a schedule published here reaches students as a notification card
// (ScheduleNotificationCard) and announcements posted here appear in their
// feed. Everything is Supabase-backed (lib/communities.ts, migration 0071);
// earnings and payouts use the existing RevHead ledger/payout backend.
type HeadTab = 'overview' | 'schedule' | 'announcements' | 'analytics' | 'earnings' | 'manage'
type EarningsRange = 7 | 30 | 90

interface HeadCommunitySettings {
  name: string
  description: string
  requireApproval: boolean
}

// A community's published schedule, as the WynkoHead and students see it.
interface PublishedSchedule { week: ScheduleItem[][]; publishedAt: number; by: string }

const HEAD_INPUT = 'w-full px-3.5 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]'

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'W'
}


function HeadBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
      style={{ background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.30)' }}>
      👑 WynkoHead
    </span>
  )
}

// Same segmented tab bar the student view uses, for any number of tabs.
function CmTabBar<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; icon: keyof typeof IP }[]
  active: T
  onChange: (t: T) => void
}) {
  return (
    <div role="tablist" className="grid gap-1 p-1 rounded-2xl border"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, background: '#0B1530', borderColor: '#1A2845' }}>
      {tabs.map(t => {
        const on = active === t.id
        return (
          <button key={t.id} role="tab" aria-selected={on} onClick={() => onChange(t.id)} title={t.label}
            className="flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: on ? 'linear-gradient(135deg,#7C4DFF,#6B44EE)' : 'transparent',
              color: on ? '#fff' : '#8B9AC7',
              boxShadow: on ? '0 0 16px rgba(124,77,255,0.5)' : 'none',
            }}>
            <Ico n={t.icon} cls="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function HeadConfirmDialog({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel }: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  confirmStyle: React.CSSProperties
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)] p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="rounded-2xl border p-7 w-[420px] max-w-full"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
        <div className="text-lg font-bold text-white mb-1.5">{title}</div>
        <div className="text-[13px] text-slate-400 mb-5 leading-relaxed">{body}</div>
        <div className="flex gap-2.5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity" style={confirmStyle}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function WynkoHeadCommunityPage({ community, headName, profile, onNavigate, onViewAsStudent, onEnterStudyRoom, headSchedule, setHeadSchedule, headUnits, setHeadUnits, published, onPublish, onCommunityChanged }: {
  community: CommunityData
  headName: string
  profile?: ProfileInfo
  onNavigate: (id: string) => void
  onViewAsStudent: () => void
  onEnterStudyRoom: (room: RoomData) => void
  headSchedule: ScheduleItem[][]
  setHeadSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[][]>>
  headUnits: StudyUnit[]
  setHeadUnits: React.Dispatch<React.SetStateAction<StudyUnit[]>>
  published: PublishedSchedule | undefined
  onPublish: () => Promise<string | null> // error message, or null when published
  onCommunityChanged: () => Promise<void> // re-read the community (name, members, ...)
}) {
  const [tab, setTab] = useState<HeadTab>('overview')
  const settings: HeadCommunitySettings = { name: community.name, description: community.desc, requireApproval: !!community.joinRequiresApproval }
  const overviewQ = useLoader(() => fetchHeadOverview(community.id), null as Awaited<ReturnType<typeof fetchHeadOverview>> | null, [community.id], 30_000)
  const annQ = useLoader(() => fetchAnnouncements(community.id), [] as CommunityAnnouncementRow[], [community.id])
  useRealtimeRefresh('community_announcements', `group_id=eq.${community.id}`, () => { void annQ.refresh() })
  const announcements = useMemo(() => annQ.data.map(toAnnouncement), [annQ.data])

  async function updateSettings(patch: Partial<HeadCommunitySettings>): Promise<string | null> {
    try {
      await updateCommunitySettings(community.id, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.requireApproval !== undefined ? { join_requires_approval: patch.requireApproval } : {}),
      })
      await onCommunityChanged()
      return null
    } catch (e) {
      return (e as Error).message
    }
  }
  async function postAnn(a: { title: string; message: string; pinned: boolean; important: boolean }): Promise<string | null> {
    try { await postAnnouncement(community.id, a); await annQ.refresh(); return null } catch (e) { return (e as Error).message }
  }
  async function deleteAnn(id: string): Promise<string | null> {
    try { await deleteAnnouncement(id); await annQ.refresh(); return null } catch (e) { return (e as Error).message }
  }

  // Students = members other than the WynkoHead.
  const members = overviewQ.data?.members ?? Math.max(0, community.members - 1)
  const studyingNow = overviewQ.data?.studying_now ?? community.studyingNow ?? 0

  const TABS: { id: HeadTab; label: string; icon: keyof typeof IP }[] = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
    { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
    { id: 'analytics', label: 'Student Analytics', icon: 'progress' },
    { id: 'earnings', label: 'Earnings', icon: 'coin' },
    { id: 'manage', label: 'Manage Community', icon: 'cog' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-[#020615]">
      <Sidebar active="studyrooms" setActive={onNavigate} profile={profile} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm mr-2">
            <Ico n="chevL" cls="w-4 h-4" /> Home
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-slate-600 mb-0.5">COMMUNITY</div>
            <div className="text-sm font-semibold text-slate-200">Manage your community, guide your students, and track their progress.</div>
          </div>
          <div className="relative p-2 text-slate-400"><Ico n="bell" cls="w-5 h-5" /><div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" /></div>
          <UserAvatar size={32} />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4 pb-6">
            {/* Community header */}
            <div className="relative rounded-2xl border" style={{ ...CM_CARD, borderColor: 'rgba(56,132,255,0.30)', boxShadow: '0 0 70px rgba(41,98,255,0.14), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <CommunityBannerArt />
              <div className="relative z-10 p-5 flex items-center gap-5 flex-wrap">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                  style={{ background: community.iconBg, boxShadow: '0 0 24px rgba(124,77,255,0.45)' }}>{community.emoji}</div>
                <div className="min-w-0 flex-1 basis-[280px]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-white leading-tight">{settings.name}</h1>
                    <HeadBadge />
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] mt-1.5" style={{ color: '#A5B4FC' }}>
                    <Ico n="rooms" cls="w-3.5 h-3.5" /> {fmt(members)} Members
                  </div>
                  <div className="flex items-center gap-2 text-[13px] text-slate-300 mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} /> {fmt(studyingNow)} active students
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setTab('manage')}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 transition-opacity"
                    style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
                    <Ico n="cog" cls="w-4 h-4" /> Manage Community
                  </button>
                  <button onClick={onViewAsStudent}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold text-slate-100 hover:text-white transition-colors border"
                    style={{ background: 'rgba(14,21,40,0.6)', borderColor: 'rgba(56,132,255,0.40)' }}>
                    View Community
                  </button>
                </div>
              </div>
            </div>

            <CmTabBar tabs={TABS} active={tab} onChange={setTab} />

            {tab === 'overview' && (
              <HeadOverviewTab community={community} overview={overviewQ.data} members={members} studyingNow={studyingNow} announcements={announcements}
                onViewAnnouncements={() => setTab('announcements')} onEnterRoom={() => onEnterStudyRoom(communityStudyRoom(community))} />
            )}
            {tab === 'schedule' && (
              <HeadScheduleTab members={members} headSchedule={headSchedule} setHeadSchedule={setHeadSchedule}
                headUnits={headUnits} setHeadUnits={setHeadUnits} published={published} onPublish={onPublish} />
            )}
            {tab === 'announcements' && (
              <HeadAnnouncementsTab headName={headName} announcements={announcements} onPost={postAnn} onDelete={deleteAnn} />
            )}
            {tab === 'analytics' && <HeadAnalyticsTab groupId={community.id} />}
            {tab === 'earnings' && <HeadEarningsTab />}
            {tab === 'manage' && (
              <HeadManageTab groupId={community.id} settings={settings} inviteToken={community.inviteToken ?? null}
                onChange={updateSettings} onMembersChanged={async () => { await onCommunityChanged(); await overviewQ.refresh() }} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Overview: the numbers that matter, the study room, latest announcements ──
function HeadOverviewTab({ community, overview, members, studyingNow, announcements, onViewAnnouncements, onEnterRoom }: {
  community: CommunityData
  overview: Awaited<ReturnType<typeof fetchHeadOverview>> | null
  members: number
  studyingNow: number
  announcements: CommunityAnnouncement[]
  onViewAnnouncements: () => void
  onEnterRoom: () => void
}) {
  const recent = [...announcements].sort((a, b) => b.postedAt - a.postedAt).slice(0, 3)
  const stats: { icon: keyof typeof IP; value: string; label: string }[] = [
    { icon: 'rooms', value: fmt(members), label: 'Total Students' },
    { icon: 'bullseye', value: overview ? fmt(overview.active_today) : '–', label: 'Active Today' },
    { icon: 'clock', value: overview ? formatStudyDuration(overview.avg_daily_minutes) : '–', label: 'Avg. Study Time / Day' },
    { icon: 'check', value: pctText(overview?.avg_adherence), label: 'Avg. Schedule Adherence' },
  ]
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {stats.map(s => (
          <div key={s.label} className="p-5 rounded-2xl border" style={CM_CARD}>
            <CmStat icon={s.icon} value={s.value} label={s.label} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-stretch">
        {/* Community Study Room */}
        <div className="p-5 rounded-2xl border h-full flex flex-col" style={CM_CARD}>
          <CmCardTitle icon="rooms" title="Community Study Room"
            right={studyingNow > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
                style={{ background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} /> Live
              </span>
            ) : undefined} />
          <div className="flex items-center gap-3 mb-4">
            <FaceAvatars colors={(community.avatarColors ?? []).slice(0, 3)} inits={(community.avatarInits ?? []).slice(0, 3)} />
            <div className="text-[13px] text-slate-300 font-medium">
              <span className="text-slate-100 font-semibold">{fmt(studyingNow)}</span> students online
            </div>
          </div>
          <div className="rounded-xl border p-4 mb-5" style={CM_ROW}>
            <div className="text-[11px] text-slate-500 mb-1">Currently studying</div>
            <div className="text-sm font-semibold text-slate-100">{overview?.current_subject || 'No one right now'}</div>
          </div>
          <button onClick={onEnterRoom}
            className="mt-auto w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
            <Ico n="play" cls="w-4 h-4" /> Enter Study Room
          </button>
        </div>

        {/* Recent announcements */}
        <div className="p-5 rounded-2xl border h-full flex flex-col" style={CM_CARD}>
          <CmCardTitle icon="megaphone" title="Recent Announcements"
            right={
              <button onClick={onViewAnnouncements} className="flex items-center gap-1 text-[12px] font-semibold text-[#5B9BFF] hover:text-[#8DBBFF] transition-colors flex-shrink-0">
                View All <Ico n="arrow" cls="w-3.5 h-3.5" />
              </button>
            } />
          {recent.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-slate-500 py-8">No announcements yet.</div>
          ) : (
            <div className="space-y-2">
              {recent.map(a => (
                <div key={a.id} className="rounded-xl border px-4 py-3" style={CM_ROW}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100 truncate">{a.title}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <AnnouncementBadges pinned={a.pinned} important={a.important} />
                      <span className="text-[11px] text-slate-500 whitespace-nowrap">{formatPostedAgo(a.postedAt)}</span>
                    </div>
                  </div>
                  <div className="text-[12px] text-slate-500 truncate mt-0.5">{a.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Schedule: the existing schedule editor + "publish to students" ──
function HeadScheduleTab({ members, headSchedule, setHeadSchedule, headUnits, setHeadUnits, published, onPublish }: {
  members: number
  headSchedule: ScheduleItem[][]
  setHeadSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[][]>>
  headUnits: StudyUnit[]
  setHeadUnits: React.Dispatch<React.SetStateAction<StudyUnit[]>>
  published: PublishedSchedule | undefined
  onPublish: () => Promise<string | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const [justPublished, setJustPublished] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const publishedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (publishedTimer.current) clearTimeout(publishedTimer.current) }, [])

  const hasSessions = headSchedule.some(d => d.length > 0)
  const unpublishedChanges = !!published && JSON.stringify(published.week) !== JSON.stringify(headSchedule)

  async function confirmPublish() {
    setConfirming(false)
    setPublishing(true)
    setPublishError(null)
    const err = await onPublish()
    setPublishing(false)
    if (err) { setPublishError(err); return }
    setJustPublished(true)
    if (publishedTimer.current) clearTimeout(publishedTimer.current)
    publishedTimer.current = setTimeout(() => setJustPublished(false), 5000)
  }

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-2xl border relative overflow-hidden"
        style={{ ...CM_CARD, borderColor: justPublished ? 'rgba(25,211,162,0.35)' : 'rgba(56,132,255,0.30)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${justPublished ? 'rgba(25,211,162,0.10)' : 'rgba(124,77,255,0.14)'} 0%, transparent 65%)`, transform: 'translate(25%,-40%)' }} />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={CM_TILE}>
            <Ico n="send" cls="w-5 h-5 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Publish to your students</div>
              {unpublishedChanges && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.30)' }}>Unpublished changes</span>
              )}
            </div>
            <div className="text-[13px] text-slate-400 leading-relaxed mt-0.5">
              Build the schedule below, then publish it. Students get a notification and choose whether to follow it or create their own.
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: publishError ? '#FBBF24' : justPublished ? '#19D3A2' : '#64748B' }}>
              {publishError
                ? publishError
                : justPublished
                  ? `Published. ${fmt(members)} students have been notified.`
                  : published ? `Last published ${formatPostedStamp(published.publishedAt)}` : 'Not published yet'}
            </div>
          </div>
          <button onClick={() => setConfirming(true)} disabled={!hasSessions || publishing}
            title={hasSessions ? undefined : 'Add at least one session first'}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
            <Ico n="send" cls="w-4 h-4" /> Publish Schedule
          </button>
        </div>
      </div>

      <SchedulesPage embedded title="Community Schedule" subtitle="The schedule your students will receive."
        onNavigate={() => {}} schedule={headSchedule} setSchedule={setHeadSchedule}
        sharedUnits={headUnits} setSharedUnits={setHeadUnits} />

      {confirming && (
        <HeadConfirmDialog title="Publish this schedule?"
          body={<>{fmt(members)} students will get a notification with this schedule ({weekSummary(headSchedule)}). Each student can accept it or keep their own schedule.</>}
          confirmLabel="Publish" confirmStyle={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}
          onConfirm={() => void confirmPublish()} onCancel={() => setConfirming(false)} />
      )}
    </div>
  )
}

// ── Announcements: post to the community, manage the feed ──
function HeadAnnouncementsTab({ headName, announcements, onPost, onDelete }: {
  headName: string
  announcements: CommunityAnnouncement[]
  onPost: (a: { title: string; message: string; pinned: boolean; important: boolean }) => Promise<string | null>
  onDelete: (id: string) => Promise<string | null>
}) {
  const [postError, setPostError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [important, setImportant] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const feed = [...announcements].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.postedAt - a.postedAt))
  const canPost = title.trim().length > 0 && message.trim().length > 0

  async function post() {
    if (!canPost || posting) return
    setPosting(true)
    setPostError(null)
    const err = await onPost({ title: title.trim(), message: message.trim(), important, pinned })
    setPosting(false)
    if (err) { setPostError(err); return }
    setTitle(''); setMessage(''); setImportant(false); setPinned(false)
  }

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, icon: keyof typeof IP, accent: string) => (
    <button type="button" onClick={() => set(!on)} aria-pressed={on}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors"
      style={{ background: on ? `${accent}1F` : 'transparent', color: on ? accent : '#64748B', borderColor: on ? `${accent}66` : '#1A2845' }}>
      <Ico n={icon} cls="w-3.5 h-3.5" /> {label}
    </button>
  )

  return (
    <div className="space-y-3.5">
      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="megaphone" title="New Announcement" sub="Visible to every student in your community" />
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Title" className={HEAD_INPUT} />
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={400} placeholder="Write your announcement…"
            className={`${HEAD_INPUT} resize-none`} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {toggle(important, setImportant, 'Important', 'alert', '#F87171')}
              {toggle(pinned, setPinned, 'Pin to top', 'pin', '#7FB0FF')}
            </div>
            {postError && <span className="text-[12px] text-amber-300">{postError}</span>}
            <button onClick={() => void post()} disabled={!canPost || posting}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
              <Ico n="send" cls="w-4 h-4" /> Post Announcement
            </button>
          </div>
        </div>
      </div>

      {feed.length === 0 ? (
        <div className="p-10 rounded-2xl border text-center" style={CM_CARD}>
          <div className="text-sm font-semibold text-slate-300 mb-1">No announcements yet</div>
          <div className="text-[12px] text-slate-500">Post your first announcement above.</div>
        </div>
      ) : feed.map(a => (
        <div key={a.id} className="p-5 rounded-2xl border" style={CM_CARD}>
          <div className="flex items-start gap-3.5">
            <CommunityHeadAvatar head={{ name: headName, initials: initialsOf(headName), color: 'linear-gradient(135deg,#7C4DFF,#4C2E9E)' }} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm font-semibold text-slate-100">{headName}</span>
                  <WynkoHeadTag />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <AnnouncementBadges pinned={a.pinned} important={a.important} />
                  <span className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
                    <Ico n="clock" cls="w-3 h-3" /> {formatPostedStamp(a.postedAt)}
                  </span>
                  {deleting === a.id ? (
                    <span className="flex items-center gap-1.5 text-[11px]">
                      <button onClick={() => { void onDelete(a.id).then(err => { if (err) setPostError(err) }); setDeleting(null) }}
                        className="font-semibold text-red-400 hover:text-red-300 transition-colors">Delete</button>
                      <span className="text-slate-700">·</span>
                      <button onClick={() => setDeleting(null)} className="text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setDeleting(a.id)} aria-label={`Delete announcement: ${a.title}`}
                      className="text-slate-600 hover:text-red-400 transition-colors"><Ico n="trash" cls="w-4 h-4" /></button>
                  )}
                </div>
              </div>
              <div className="text-[15px] font-semibold text-slate-100 mt-2.5 mb-1">{a.title}</div>
              <div className="text-[13px] text-slate-400 leading-relaxed whitespace-pre-wrap break-words">{a.message}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Student Analytics: how every student is doing ──
// One student's row, from community_student_analytics (this month's study,
// streak, revision count, completed Focus Lock tasks, last activity, adherence).
interface HeadStudent {
  id: string; name: string; initials: string; color: string
  studyMinutes: number; sessions: number; streakDays: number; revision: number; tasks: number
  lastActiveMins: number; adherencePct: number | null
}
function toHeadStudent(r: StudentAnalyticsRow): HeadStudent {
  const [c1, c2] = ROOM_GRADIENTS[hashSubject(r.user_id) % ROOM_GRADIENTS.length]
  const last = r.last_active_at ? new Date(r.last_active_at).getTime() : 0
  return {
    id: r.user_id, name: r.name, initials: initialsOf(r.name), color: `linear-gradient(135deg,${c1},${c2})`,
    studyMinutes: r.study_minutes, sessions: r.sessions, streakDays: r.streak_days, revision: r.revision, tasks: r.tasks,
    lastActiveMins: last ? Math.max(0, Math.floor((Date.now() - last) / 60000)) : Number.POSITIVE_INFINITY,
    adherencePct: r.adherence,
  }
}

function HeadAnalyticsTab({ groupId }: { groupId: string }) {
  type Filter = 'all' | 'active' | 'inactive' | 'low'
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showAll, setShowAll] = useState(false)
  const studentsQ = useLoader(() => fetchStudentAnalytics(groupId), [] as StudentAnalyticsRow[], [groupId], 120_000)
  const students = useMemo(() => studentsQ.data.map(toHeadStudent), [studentsQ.data])

  const rows = students
    .filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(s => filter === 'all' ? true
      : filter === 'active' ? s.lastActiveMins < 24 * 60
      : filter === 'inactive' ? s.lastActiveMins >= 3 * 24 * 60
      : s.adherencePct != null && s.adherencePct < 50)
    .sort((a, b) => (b.adherencePct ?? -1) - (a.adherencePct ?? -1) || b.studyMinutes - a.studyMinutes)
  const visible = showAll ? rows : rows.slice(0, 8)

  const ago = (m: number) => !Number.isFinite(m) ? 'Never' : m < 60 ? `${m}m ago` : m < 24 * 60 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / (24 * 60))}d ago`
  const barFor = (p: number) => p >= 70 ? 'linear-gradient(90deg,#19D3A2,#22D3EE)' : p >= 50 ? 'linear-gradient(90deg,#2979FF,#60A5FA)' : 'linear-gradient(90deg,#7C4DFF,#A78BFA)'
  const COLS = 'grid-cols-[minmax(170px,1.6fr)_repeat(5,minmax(64px,0.7fr))_minmax(84px,0.8fr)_minmax(150px,1.3fr)]'

  return (
    <div className="p-5 rounded-2xl border" style={CM_CARD}>
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-2.5 mr-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={CM_TILE}><Ico n="progress" cls="w-4 h-4 text-cyan-300" /></div>
          <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Student Analytics</div>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Ico n="search" cls="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => { setQuery(e.target.value); setShowAll(false) }} placeholder="Search students..." aria-label="Search students"
            className={`${HEAD_INPUT} pl-10`} style={{ background: 'rgba(14,21,40,0.55)' }} />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value as Filter); setShowAll(false) }} aria-label="Filter students"
          className="ml-auto px-3.5 py-2.5 rounded-xl border text-sm text-slate-200 outline-none focus:border-violet-500/50 transition-colors border-[#1A2845] cursor-pointer"
          style={{ background: 'rgba(14,21,40,0.55)', colorScheme: 'dark' }}>
          <option value="all">All Students</option>
          <option value="active">Active Today</option>
          <option value="inactive">Inactive 3+ Days</option>
          <option value="low">Low Adherence</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`grid ${COLS} gap-3 px-4 pb-2.5 text-[11px] font-semibold text-slate-500 border-b border-[rgba(26,40,69,0.9)]`}>
            <div>Student</div><div>Study Time</div><div>Sessions</div><div>Streak</div><div>Revision</div><div>Tasks</div><div>Last Active</div><div>Adherence</div>
          </div>
          {visible.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-500">
              {studentsQ.status === 'loading' ? 'Loading students…'
                : studentsQ.status === 'error' ? studentsQ.error
                : students.length === 0 ? 'No students yet. Share your invite link from Manage Community.'
                : 'No students match.'}
            </div>
          ) : visible.map(s => (
            <div key={s.id} className={`grid ${COLS} gap-3 px-4 py-3 items-center text-[13px] text-slate-300 border-b border-[rgba(26,40,69,0.6)] last:border-b-0 hover:bg-white/[0.02] transition-colors`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: s.color }}>{s.initials}</div>
                <span className="font-medium text-slate-100 truncate">{s.name}</span>
              </div>
              <div>{formatStudyDuration(s.studyMinutes)}</div>
              <div>{s.sessions}</div>
              <div>{s.streakDays === 0 ? '–' : `${s.streakDays} day${s.streakDays === 1 ? '' : 's'}`}</div>
              <div>{s.revision}</div>
              <div>{s.tasks}</div>
              <div className="text-slate-400">{ago(s.lastActiveMins)}</div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(26,40,69,0.9)' }}>
                  <div className="h-full rounded-full" style={{ width: `${s.adherencePct ?? 0}%`, background: barFor(s.adherencePct ?? 0) }} />
                </div>
                <span className="w-9 text-right text-[12px] text-slate-400">{pctText(s.adherencePct)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {rows.length > 8 && (
        <button onClick={() => setShowAll(v => !v)} className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#5B9BFF] hover:text-[#8DBBFF] transition-colors">
          {showAll ? 'Show fewer students' : 'View All Students'} {!showAll && <Ico n="arrow" cls="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── Earnings: what this community has earned the WynkoHead ──
function EarningsChart({ points }: { points: { label: string; value: number }[] }) {
  const W = 640, H = 210, PL = 20, PR = 20, PT = 18, PB = 12
  const n = points.length
  const max = Math.max(...points.map(p => p.value), 1)
  const xs = points.map((_, i) => PL + (i / Math.max(n - 1, 1)) * (W - PL - PR))
  const ys = points.map(p => PT + (1 - p.value / max) * (H - PT - PB))
  // Catmull-Rom → cubic Bézier, so the line curves through every point.
  let line = `M${xs[0]},${ys[0]}`
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i - 1] ?? xs[i], y0 = ys[i - 1] ?? ys[i]
    const x3 = xs[i + 2] ?? xs[i + 1], y3 = ys[i + 2] ?? ys[i + 1]
    line += ` C${xs[i] + (xs[i + 1] - x0) / 6},${ys[i] + (ys[i + 1] - y0) / 6} ${xs[i + 1] - (x3 - xs[i]) / 6},${ys[i + 1] - (y3 - ys[i]) / 6} ${xs[i + 1]},${ys[i + 1]}`
  }
  const area = `${line} L${xs[n - 1]},${H - PB} L${xs[0]},${H - PB} Z`
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Earnings over time">
        <defs>
          <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C4DFF" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#earnFill)" />
        <path d={line} fill="none" stroke="#8B7CFF" strokeWidth="2.5" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={xs[i]} cy={ys[i]} r="4.5" fill="#8B7CFF" stroke="#0B1530" strokeWidth="2">
            <title>{`${p.label} · ₹${p.value.toLocaleString('en-IN')}`}</title>
          </circle>
        ))}
      </svg>
      <div className="relative h-5 mt-1">
        {points.map((p, i) => (
          <span key={i} className="absolute text-[10px] text-slate-500 whitespace-nowrap -translate-x-1/2" style={{ left: `${(xs[i] / W) * 100}%` }}>{p.label}</span>
        ))}
      </div>
    </div>
  )
}

// Earnings come from the existing RevHead backend: revhead_earnings_ledger
// (own rows, RLS), my_wallet_balance (unclaimed), my_payout_history and
// request_payout (needs a UPI ID on the profile; admins process it).
const EARNING_SOURCE_META: Record<string, { emoji: string; label: string }> = {
  platform: { emoji: '👥', label: 'Community activity' },
  premium: { emoji: '⭐', label: 'Premium purchases' },
  store: { emoji: '🛍️', label: 'Store purchases' },
  ads: { emoji: '📺', label: 'Ads' },
  ad: { emoji: '📺', label: 'Ads' },
}
function buildEarningsView(rows: { amount: number; source: string | null; occurred_at: string }[], range: EarningsRange) {
  const DAY = 86400000
  const now = Date.now()
  const inRange = rows.filter(r => now - new Date(r.occurred_at).getTime() < range * DAY)
  const prev = rows.filter(r => { const age = now - new Date(r.occurred_at).getTime(); return age >= range * DAY && age < 2 * range * DAY })
  const total = inRange.reduce((a, r) => a + r.amount, 0)
  const prevTotal = prev.reduce((a, r) => a + r.amount, 0)
  const changePct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0
  const n = range === 7 ? 7 : range === 30 ? 8 : 9
  const points = Array.from({ length: n }, (_, i) => {
    const daysAgo = Math.round((range - 1) * (1 - i / (n - 1)))
    const cutoff = now - daysAgo * DAY
    const value = Math.round(inRange.filter(r => new Date(r.occurred_at).getTime() <= cutoff).reduce((a, r) => a + r.amount, 0))
    return { label: new Date(cutoff).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), value }
  })
  const bySource = new Map<string, number>()
  inRange.forEach(r => bySource.set(r.source || 'platform', (bySource.get(r.source || 'platform') ?? 0) + r.amount))
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({
    id, emoji: EARNING_SOURCE_META[id]?.emoji ?? '💰', label: EARNING_SOURCE_META[id]?.label ?? id, note: '50% share', amount: Math.round(amount),
  }))
  return { total: Math.round(total), changePct, points, sources }
}

function HeadEarningsTab() {
  const [range, setRange] = useState<EarningsRange>(30)
  const ledgerQ = useLoader(() => fetchEarningsLedger(180), [] as { amount: number; source: string | null; occurred_at: string }[], [], 120_000)
  const payoutsQ = useLoader(fetchPayoutHistory, [] as Awaited<ReturnType<typeof fetchPayoutHistory>>, [], 120_000)
  const balanceQ = useLoader(fetchWalletBalance, 0, [], 120_000)
  const data = useMemo(() => buildEarningsView(ledgerQ.data, range), [ledgerQ.data, range])
  const latest = payoutsQ.data[0]
  const nextDate = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) })()
  const payout = {
    status: (latest && latest.status !== 'paid' ? 'Pending' : 'Paid') as 'Paid' | 'Pending',
    lastAmount: Math.round(latest?.amount ?? 0),
    lastDate: latest ? new Date(latest.processed_at ?? latest.requested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
    nextAmount: Math.round(balanceQ.data),
    nextDate,
  }
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`
  const SOURCE_COLORS = ['#7C4DFF', '#22D3EE', '#19D3A2', '#F59E0B', '#EC4899']
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  async function requestWithdraw() {
    if (withdrawing || withdrawn) return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await requestPayout()
      setWithdrawn(true)
      await Promise.all([payoutsQ.refresh(), balanceQ.refresh(), ledgerQ.refresh()])
    } catch (e) {
      setWithdrawError((e as Error).message)
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="rounded-2xl border overflow-hidden" style={CM_CARD}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
          <div className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={CM_TILE}><Ico n="coin" cls="w-4 h-4 text-cyan-300" /></div>
                <div className="text-base font-bold text-slate-100" style={{ fontFamily: 'Poppins, sans-serif' }}>Earnings Overview</div>
              </div>
              <select value={range} onChange={e => setRange(Number(e.target.value) as EarningsRange)} aria-label="Earnings period"
                className="px-3.5 py-2 rounded-xl border text-[13px] text-slate-200 outline-none focus:border-violet-500/50 transition-colors border-[#1A2845] cursor-pointer"
                style={{ background: 'rgba(14,21,40,0.55)', colorScheme: 'dark' }}>
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <div>
                <div className="text-3xl font-bold text-white leading-tight">{inr(data.total)}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">Total Earnings</div>
              </div>
              {data.changePct !== 0 && (
                <div className={`pb-1 text-[13px] font-semibold ${data.changePct > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{data.changePct > 0 ? '↑' : '↓'} {Math.abs(data.changePct)}%</div>
              )}
            </div>
            <EarningsChart points={data.points} />
          </div>

          <div className="p-5 border-t lg:border-t-0 lg:border-l border-[rgba(26,40,69,0.9)] flex flex-col gap-5">
            <div>
              <div className="text-[13px] text-slate-400 mb-2">Payout Status</div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold"
                style={payout.status === 'Paid'
                  ? { background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }
                  : { background: 'rgba(245,158,11,0.10)', color: '#FBBF24', border: '1px solid rgba(245,158,11,0.30)' }}>
                <Ico n="check" cls="w-3.5 h-3.5" /> {payout.status}
              </span>
              <div className="text-[11px] text-slate-500 mt-2">{latest ? `${inr(payout.lastAmount)} ${payout.status === 'Paid' ? 'paid' : 'requested'} on ${payout.lastDate}` : 'No payouts yet'}</div>
            </div>
            <div>
              <div className="text-[13px] text-slate-400 mb-1">Next payout</div>
              <div className="text-lg font-bold text-slate-100">{payout.nextDate}</div>
              <div className="text-[13px] text-slate-300 mt-0.5">{inr(payout.nextAmount)} <span className="text-slate-500">(estimated)</span></div>
            </div>
            {withdrawError && <div className="text-[11px] text-amber-300 -mb-2">{withdrawError}</div>}
            <button onClick={() => void requestWithdraw()} disabled={withdrawing || withdrawn || payout.nextAmount <= 0}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2"
              style={withdrawn
                ? { background: 'rgba(25,211,162,0.12)', color: '#19D3A2', border: '1px solid rgba(25,211,162,0.30)' }
                : { background: 'linear-gradient(135deg,#7C4DFF,#6B44EE)', color: '#fff', boxShadow: '0 0 16px #1E3060' }}>
              {withdrawn ? <><Ico n="check" cls="w-3.5 h-3.5" /> Withdrawal requested</> : withdrawing ? 'Requesting…' : 'Withdraw'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="coin" title="Earnings by Source" sub={`Last ${range} days`} />
        {data.sources.length === 0 && (
          <div className="text-[13px] text-slate-500 py-2">{ledgerQ.status === 'loading' ? 'Loading earnings…' : ledgerQ.status === 'error' ? ledgerQ.error : 'No earnings in this period yet.'}</div>
        )}
        <div className="space-y-2">
          {data.sources.map((s, i) => {
            const pct = data.total > 0 ? Math.round((s.amount / data.total) * 100) : 0
            return (
              <div key={s.id} className="rounded-xl border px-4 py-3.5" style={CM_ROW}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${SOURCE_COLORS[i % SOURCE_COLORS.length]}1A`, border: `1px solid ${SOURCE_COLORS[i % SOURCE_COLORS.length]}44` }}>{s.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-100">{s.label}</div>
                    <div className="text-[11px] text-slate-500">{s.note}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-100">{inr(s.amount)}</div>
                    <div className="text-[11px] text-slate-500">{pct}%</div>
                  </div>
                </div>
                <div className="h-1 rounded-full mt-3 overflow-hidden" style={{ background: 'rgba(26,40,69,0.9)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Manage Community: details, invite & access, join requests ──
function HeadManageTab({ groupId, settings, inviteToken, onChange, onMembersChanged }: {
  groupId: string
  settings: HeadCommunitySettings
  inviteToken: string | null
  onChange: (patch: Partial<HeadCommunitySettings>) => Promise<string | null>
  onMembersChanged: () => Promise<void>
}) {
  const [name, setName] = useState(settings.name)
  const [description, setDescription] = useState(settings.description)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])
  const requestsQ = useLoader(() => fetchJoinRequests(groupId), [] as JoinRequestRow[], [groupId])
  useRealtimeRefresh('community_join_requests', `group_id=eq.${groupId}`, () => { void requestsQ.refresh() })

  const dirty = name.trim() !== settings.name || description.trim() !== settings.description
  const inviteLink = inviteToken ? communityInviteLink(inviteToken) : ''
  const pending = requestsQ.data.map(r => {
    const [c1, c2] = ROOM_GRADIENTS[hashSubject(r.user_id) % ROOM_GRADIENTS.length]
    return { id: r.id, name: r.name, initials: initialsOf(r.name), color: `linear-gradient(135deg,${c1},${c2})`, note: r.note || 'Wants to join', requestedAgo: formatPostedAgo(new Date(r.created_at).getTime()) }
  })

  async function save() {
    if (!name.trim()) return
    setSaveError(null)
    const err = await onChange({ name: name.trim(), description: description.trim() })
    if (err) { setSaveError(err); return }
    setSaved(true)
    timers.current.push(setTimeout(() => setSaved(false), 2500))
  }
  function copyInvite() {
    if (!inviteLink) return
    navigator.clipboard?.writeText(inviteLink)
    setCopied(true)
    timers.current.push(setTimeout(() => setCopied(false), 2000))
  }
  async function handle(id: string, approve: boolean) {
    try {
      const result = await decideJoinRequest(id, approve)
      if (result === 'full') setSaveError('Your community is full.')
      await requestsQ.refresh()
      if (approve) await onMembersChanged()
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="cog" title="Community Details" sub="How your community appears to students" />
        <div className="space-y-3.5">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">Community name</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={HEAD_INPUT} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={240} className={`${HEAD_INPUT} resize-none`} />
          </label>
          <div className="flex items-center justify-end gap-3">
            {saveError && <span className="text-[12px] text-amber-300">{saveError}</span>}
            {saved && <span className="text-[12px] text-emerald-400">Saved</span>}
            <button onClick={() => void save()} disabled={!dirty || !name.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>Save Changes</button>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="rooms" title="Invite & Access" sub="Control how students join" />
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Invite link</div>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border text-sm text-slate-200 truncate border-[#1A2845]" style={{ background: 'rgba(14,21,40,0.55)' }}>{inviteLink.replace(/^https?:\/\//, '') || 'Loading…'}</div>
          <button onClick={copyInvite}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-colors text-slate-200 hover:text-white hover:border-[rgba(56,132,255,0.6)]"
            style={{ background: 'rgba(41,98,255,0.08)', borderColor: 'rgba(56,132,255,0.35)' }}>
            <Ico n="copy" cls="w-4 h-4" /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5" style={CM_ROW}>
          <div>
            <div className="text-sm font-semibold text-slate-100">Approve new students manually</div>
            <div className="text-[12px] text-slate-500 mt-0.5">Students who use your link wait for your approval before they join.</div>
          </div>
          <button role="switch" aria-checked={settings.requireApproval} aria-label="Approve new students manually"
            onClick={() => { void onChange({ requireApproval: !settings.requireApproval }).then(err => { if (err) setSaveError(err) }) }}
            className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors"
            style={{ background: settings.requireApproval ? '#7C4DFF' : 'rgba(71,85,105,0.5)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: settings.requireApproval ? 22 : 2 }} />
          </button>
        </div>
      </div>

      <div className="p-5 rounded-2xl border" style={CM_CARD}>
        <CmCardTitle icon="check" title="Join Requests" sub={settings.requireApproval || pending.length > 0 ? `${pending.length} waiting for approval` : 'Manual approval is off'} />
        {!settings.requireApproval && pending.length === 0 ? (
          <div className="text-[13px] text-slate-500 py-2">New students join instantly. Turn on manual approval above to review them first.</div>
        ) : pending.length === 0 ? (
          <div className="text-[13px] text-slate-500 py-2">No pending requests.</div>
        ) : (
          <div className="space-y-2">
            {pending.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={CM_ROW}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0" style={{ background: r.color }}>{r.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">{r.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{r.note} · {r.requestedAgo}</div>
                </div>
                <button onClick={() => void handle(r.id, false)}
                  className="px-4 py-1.5 rounded-lg border text-[12px] font-semibold text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">Decline</button>
                <button onClick={() => void handle(r.id, true)}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#19D3A2,#0DAE86)' }}>
                  <Ico n="check" cls="w-3.5 h-3.5" /> Approve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Student-side notification: the WynkoHead published a schedule ──
// Floats over whatever page the student is on until they choose.
function ScheduleNotificationCard({ communityName, published, onAccept, onCreateOwn, onDismiss }: {
  communityName: string
  published: PublishedSchedule
  onAccept: () => void
  onCreateOwn: () => void
  onDismiss: () => void
}) {
  const week = published.week as ScheduleItem[][]
  return (
    <div role="alert" className="fixed top-[68px] right-4 z-[70] w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border p-5"
      style={{ background: 'linear-gradient(160deg, #0F1838 0%, #0A1024 100%)', borderColor: '#2855CC', boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 50px rgba(124,77,255,0.30)' }}>
      <div className="flex items-start gap-3">
        <CommunityHeadAvatar head={{ name: published.by, initials: initialsOf(published.by), color: 'linear-gradient(135deg,#7C4DFF,#4C2E9E)' }} size={40} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-violet-400 font-mono tracking-[0.15em] mb-0.5">NEW SCHEDULE</div>
          <div className="text-sm font-bold text-white leading-snug">{published.by} published a schedule for {communityName}</div>
        </div>
        <button onClick={onDismiss} aria-label="Decide later" title="Decide later"
          className="w-7 h-7 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors flex-shrink-0">
          <Ico n="close" cls="w-4 h-4" />
        </button>
      </div>
      <div className="rounded-xl border px-3.5 py-2.5 mt-3.5 text-[12px] text-slate-300" style={CM_ROW}>{weekSummary(week)}</div>
      <div className="text-[12px] text-slate-500 mt-3">Follow it, or keep and create your own. It’s your choice.</div>
      <div className="flex items-center gap-2.5 mt-3.5">
        <button onClick={onAccept}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#19D3A2,#0DAE86)', boxShadow: '0 0 18px rgba(25,211,162,0.30)' }}>
          <Ico n="check" cls="w-4 h-4" /> Accept Schedule
        </button>
        <button onClick={onCreateOwn}
          className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold text-slate-200 hover:text-white transition-colors hover:border-[rgba(56,132,255,0.6)]"
          style={{ background: 'rgba(41,98,255,0.08)', borderColor: 'rgba(56,132,255,0.35)' }}>
          Create My Own
        </button>
      </div>
    </div>
  )
}

// ─── Room focus bar ────────────────────────────────────────────────────────────
// Pinned timer row at the top of a study room:
//   [ time ]  [ Start / Pause ]  [ task picker ]  [ ⋮ ]
// The picker lists the Focus Lock plan (the same persisted snapshot FocusLockPage
// reads), so a task's subject, topic, timer type and progress are identical in
// both places. Presentational only - the room owns the timer engine.
function RoomFocusBar({ tasks, selectedTask, running, focusSecs, onSelectTask, onToggle, onReset, onOpenFocusLock }: {
  tasks: StudyTask[]; selectedTask: StudyTask | null; running: boolean; focusSecs: number
  onSelectTask: (id: string) => void; onToggle: () => void; onReset: () => void; onOpenFocusLock: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Outside click / Esc closes whichever popover is open.
  useEffect(() => {
    if (!pickerOpen && !menuOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(t)) setPickerOpen(false)
      if (menuOpen && menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPickerOpen(false); setMenuOpen(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen, menuOpen])

  const isPomo = (selectedTask?.mode ?? 'pomodoro') === 'pomodoro'
  const onBreak = !!selectedTask && isPomo && pomoPhase(selectedTask) === 'break'
  const total = selectedTask ? pomoTotal(selectedTask) : focusSecs
  const remaining = selectedTask ? selectedTask.pomodoroRemaining : focusSecs
  const elapsed = selectedTask ? selectedTask.regularElapsed : 0
  const finished = !!selectedTask && isPomo && remaining <= 0
  const hasProgress = isPomo ? remaining < total : elapsed > 0
  const timeStr = isPomo ? formatClock(remaining) : formatClock(elapsed, true)

  const statusLabel = finished ? 'Completed' : running ? (onBreak ? 'Break' : isPomo ? 'Focus' : 'Studying') : hasProgress ? 'Paused' : (onBreak ? 'Break' : isPomo ? 'Focus' : 'Count up')
  const statusColor = finished ? '#34D399' : running ? (onBreak ? '#34D399' : '#38BDF8') : hasProgress ? '#FBBF24' : (onBreak ? '#34D399' : '#60A5FA')
  const btnLabel = running ? 'Pause' : finished ? 'Restart' : hasProgress ? 'Resume' : onBreak ? 'Start Break' : 'Start Focus'

  const q = query.trim().toLowerCase()
  const shown = q ? tasks.filter(t => `${t.subject} ${t.topic}`.toLowerCase().includes(q)) : tasks
  const sel = selectedTask ? subjectVisual(selectedTask.subject) : null

  return (
    <div className="relative rounded-2xl border px-5 py-4"
      style={{ background: 'linear-gradient(135deg,#0B1530,#0F1845)', borderColor: '#1E3060', boxShadow: '0 0 40px rgba(124,77,255,0.18), 0 0 80px rgba(40,85,204,0.08)' }}>
      {/* The glow gets its own clipped layer so the card itself can stay overflow-visible for the popovers. */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute right-0 top-0 bottom-0 w-56 opacity-20"
          style={{ background: 'radial-gradient(ellipse at right center,#7C4DFF,transparent 70%)' }} />
      </div>

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-4">
        {/* 1 · Timer (no ring/clock icon - just the time, bigger) */}
        <div className="flex items-center flex-shrink-0">
          <div>
            {/* tabular-nums + a fixed min-width keep neighbouring blocks from jittering as the digits change */}
            <div className="text-[42px] leading-none font-bold text-white tabular-nums whitespace-nowrap"
              style={{ fontFamily: 'JetBrains Mono, monospace', minWidth: isPomo ? '5ch' : '8ch', textShadow: '0 0 20px #4A3A88' }}>
              {timeStr}
            </div>
            <div className="mt-1.5 text-[11px] font-medium tracking-wide" style={{ color: statusColor }}>{statusLabel}</div>
          </div>
        </div>

        {/* 2 · Start / Pause */}
        <button onClick={onToggle} disabled={!selectedTask}
          title={selectedTask ? undefined : 'Pick a task first'}
          className="flex-shrink-0 h-[52px] px-5 rounded-2xl flex items-center justify-center gap-2 text-sm font-semibold text-white border transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ minWidth: 128, ...(running
            ? { background: 'rgba(255,255,255,0.06)', borderColor: '#2A3A66' }
            : { background: 'linear-gradient(135deg,#4F6BFF 0%,#7C4DFF 100%)', borderColor: 'transparent', boxShadow: '0 0 24px rgba(99,102,241,0.45)' }) }}>
          {running
            ? <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            : <Ico n="play" cls="w-4 h-4 flex-shrink-0" />}
          {btnLabel}
        </button>

        {/* 3 · Task picker (Focus Lock plan) */}
        <div ref={pickerRef} className="relative flex-shrink-0 min-w-0" style={{ width: 260 }}>
          <button onClick={() => { setQuery(''); setPickerOpen(o => !o); setMenuOpen(false) }}
            aria-haspopup="listbox" aria-expanded={pickerOpen}
            className="w-full h-[52px] px-3.5 rounded-2xl border flex items-center gap-3 text-left transition-colors hover:border-violet-400/40"
            style={{ background: 'rgba(26,40,69,0.55)', borderColor: pickerOpen ? 'rgba(124,77,255,0.55)' : '#1E3060' }}>
            {selectedTask && sel ? (
              <>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: `${sel.color}1A`, border: `1px solid ${sel.color}44` }}>{sel.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-100 truncate leading-tight">{selectedTask.subject}</span>
                  <span className="block text-[11px] text-slate-400 truncate leading-tight mt-0.5">{selectedTask.topic}</span>
                </span>
              </>
            ) : (
              <span className="flex-1 text-sm text-slate-400">{tasks.length ? 'Select a task' : 'No tasks yet'}</span>
            )}
            <Ico n="chevR" cls={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${pickerOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>

          {pickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl border p-2.5"
              style={{ minWidth: 300, background: '#0B1530', borderColor: '#1E3060', boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
              <div className="px-2 pt-1 pb-2.5">
                <div className="text-[11px] font-semibold tracking-wide text-slate-300">Focus Lock tasks</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{running ? 'Switching tasks pauses the current timer' : 'Pick what you’re studying'}</div>
              </div>

              {tasks.length > 4 && (
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks…" autoFocus
                  className="w-full mb-2.5 px-3 py-2 rounded-xl border bg-transparent text-[13px] text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/40 transition-colors"
                  style={{ background: 'rgba(26,40,69,0.45)', borderColor: '#1A2845' }} />
              )}

              <div role="listbox" aria-label="Focus Lock tasks" className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 280 }}>
                {tasks.length === 0 && (
                  <div className="px-3 py-6 text-center">
                    <div className="text-2xl mb-2">📝</div>
                    <div className="text-[13px] font-semibold text-slate-200">No tasks in Focus Lock yet</div>
                    <div className="text-[11px] text-slate-500 mt-1">Add a task there and it will show up here.</div>
                  </div>
                )}
                {tasks.length > 0 && shown.length === 0 && (
                  <div className="px-3 py-5 text-center text-[12px] text-slate-500">No tasks match “{query.trim()}”</div>
                )}
                {shown.map(t => {
                  const v = subjectVisual(t.subject)
                  const isSel = t.id === selectedTask?.id
                  const isLive = isSel && running
                  const tDone = t.mode === 'pomodoro' && t.pomodoroRemaining <= 0
                  const tBreak = t.mode === 'pomodoro' && pomoPhase(t) === 'break'
                  const tTime = t.mode === 'pomodoro'
                    ? (tDone ? 'Completed' : tBreak ? `Break ${formatClock(t.pomodoroRemaining)}` : `${formatClock(t.pomodoroRemaining)} left`)
                    : formatClock(t.regularElapsed, true)
                  return (
                    <button key={t.id} role="option" aria-selected={isSel}
                      onClick={() => { setPickerOpen(false); onSelectTask(t.id) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors hover:bg-white/[0.04]"
                      style={{ background: isSel ? 'rgba(124,77,255,0.12)' : 'transparent', borderColor: isSel ? 'rgba(124,77,255,0.4)' : 'transparent' }}>
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: `${v.color}1A`, border: `1px solid ${v.color}44` }}>{v.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-semibold text-slate-100 truncate">{t.subject}</span>
                        </span>
                        <span className="flex items-center justify-between gap-3 mt-0.5">
                          <span className="text-[11px] text-slate-500 truncate">{t.topic}</span>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono flex-shrink-0" style={{ color: isLive ? '#E2E8F0' : '#8B9AC7' }}>
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            {tTime}
                          </span>
                        </span>
                      </span>
                      <span className="w-4 flex-shrink-0 flex justify-center text-violet-300">
                        {isSel && <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(30,48,96,0.7)' }}>
                <button onClick={() => { setPickerOpen(false); onOpenFocusLock() }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-[12px] text-violet-300 hover:text-violet-200 hover:bg-violet-500/10 transition-colors">
                  Manage tasks in Focus Lock →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4 · More */}
        <div ref={menuRef} className="relative flex-shrink-0" style={{ isolation: 'isolate' }}>
          <button onClick={() => { setMenuOpen(o => !o); setPickerOpen(false) }}
            aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen}
            className="w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 border transition-colors"
            style={{ background: 'rgba(26,40,69,0.55)', borderColor: '#1E3060' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
          </button>
          {menuOpen && (
            <div role="menu"
              className="absolute right-0 top-full mt-2 z-40 flex flex-col rounded-xl border p-1.5 gap-0.5"
              style={{
                width: 'max-content',
                minWidth: 180,
                maxWidth: 220,
                boxSizing: 'border-box',
                background: '#0B1530',
                borderColor: '#1E3060',
                boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(30,72,150,0.25), 0 0 24px rgba(124,77,255,0.12)',
              }}>
              <button role="menuitem" disabled={!selectedTask || !(hasProgress || onBreak)}
                onClick={() => { setMenuOpen(false); onReset() }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[12px] text-slate-200 hover:bg-white/[0.05] transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed whitespace-nowrap">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
                Reset timer
              </button>
              <button role="menuitem"
                onClick={() => { setMenuOpen(false); onOpenFocusLock() }}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-[12px] text-slate-200 hover:bg-white/[0.05] transition-colors whitespace-nowrap">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                Open Focus Lock
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Loads the Focus Lock plan for a room the same way FocusLockPage does - same persisted
// snapshot, same seed-from-real-data fallback, same catch-up for time that passed while
// neither screen was mounted - so both screens always agree on the tasks and their progress.
function initRoomPlan(units: StudyUnit[], schedule: ScheduleItem[][], todayIdx: number) {
  const pomo = getPomodoroSettings()
  const snap = loadFocusPlanSnapshot()
  let tasks = snap?.tasks ?? seedTasksFromRealData(units, schedule, todayIdx, pomo)
  const activeId = snap?.activeTaskId ?? null
  let running = !!snap?.running && !!activeId && tasks.some(t => t.id === activeId)
  if (running && snap?.runningStartedAtMs) {
    const away = Math.max(0, Math.floor((Date.now() - snap.runningStartedAtMs) / 1000))
    if (away > 0) {
      tasks = tasks.map(t => {
        if (t.id !== activeId) return t
        if (t.mode === 'pomodoro') {
          // Through the engine: time spent away can cross focus/break boundaries.
          const r = tickPomodoro(t, away, pomo)
          if (!r.running) running = false
          return r.task
        }
        return { ...t, regularElapsed: t.regularElapsed + away }
      })
    }
  }
  const selectedTaskId = activeId && tasks.some(t => t.id === activeId) ? activeId : (tasks[0]?.id ?? null)
  return { tasks, selectedTaskId, running }
}

// ─── Room Interior Page ────────────────────────────────────────────────────────
function RoomInteriorPage({ room, onBack, onNavigate, profile, units, schedule, todayIdx, backLabel = 'Rooms' }: {
  room: RoomData; onBack: () => void; onNavigate: (id: string) => void; profile?: ProfileInfo
  units: StudyUnit[]; schedule: ScheduleItem[][]; todayIdx: number
  backLabel?: string // "Community" when the room was opened from a community page
}) {
  const { avatar: userAvatar } = useContext(UserAvatarCtx)
  const bots = useMemo(() => getRoomBots(room), [room])
  const { settings: pomo } = usePomodoroSettings()
  // The room's timer runs a Focus Lock task: same plan, same progress, same backend session.
  const [initial] = useState(() => initRoomPlan(units, schedule, todayIdx))
  const [planTasks, setPlanTasks] = useState<StudyTask[]>(initial.tasks)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initial.selectedTaskId)
  const [focusRunning, setFocusRunning] = useState<boolean>(initial.running)
  const [activeTab, setActiveTab] = useState<'studying' | 'chat'>('studying')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>(getInitialChat(room))
  const [botTimes, setBotTimes] = useState(bots.map(b => b.studyTimeSecs))
  const [userStudyTime, setUserStudyTime] = useState(0)
  const [kickedIds, setKickedIds] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)
  const tasksRef = useRef(planTasks)
  tasksRef.current = planTasks
  const pomoRef = useRef(pomo)
  pomoRef.current = pomo
  const togglingRef = useRef(false)

  // Sessions started in a real room count toward it (study_sessions.group_id).
  const { start: startRemoteSession, stop: stopRemoteSession } = useFocusSession(room.groupId ?? null)
  // Real room: members + live study state + chat from Supabase (lib/studyRooms.ts).
  const live = useRoomLive(room.groupId ?? null)
  const isRealRoom = !!room.groupId
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isRealRoom) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRealRoom])
  const [chatError, setChatError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Pause barrier (same 150-word reflection as Focus Lock): any action that
  // stops a running room timer - Pause, "Pause & Open Chat", switching task,
  // Reset - waits here until the reflection is unlocked. Never saved.
  const [pausePrompt, setPausePrompt] = useState<{ run: () => void } | null>(null)

  // Side effects of a Pomodoro tick (same rules as Focus Lock), kept out of the state updater and
  // reassigned every render so the interval below always calls the current start/stop closures.
  const afterPomodoroTickRef = useRef<(before: StudyTask, r: { task: StudyTask; running: boolean }) => void>(() => {})
  afterPomodoroTickRef.current = (before, r) => {
    if (!r.running) {
      setFocusRunning(false)
      stopRemoteSession()
      return
    }
    const from = pomoPhase(before), to = pomoPhase(r.task)
    if (from === to) return
    if (to === 'break') stopRemoteSession()
    else void startRemoteSession(before.subject)
  }

  const selectedTask = planTasks.find(t => t.id === selectedTaskId) ?? null

  // Ticker. Counts real elapsed wall-clock seconds rather than "+1 per interval fire",
  // so a throttled/backgrounded tab (or a late timer) can't make the clock run slow or
  // stutter; it polls 4x/sec so the display flips within ~250ms of each second boundary.
  // A Pomodoro never applies more time than it has left.
  useEffect(() => {
    if (!focusRunning || !selectedTaskId) return
    let last = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const delta = Math.floor((now - last) / 1000)
      if (delta < 1) return
      last += delta * 1000
      const t = tasksRef.current.find(x => x.id === selectedTaskId)
      if (!t) return
      if (t.mode === 'pomodoro') {
        // Shared Pomodoro engine: focus -> break -> next focus per the saved settings. Only focus
        // seconds count as this person's study time in the room.
        const r = tickPomodoro(t, delta, pomoRef.current)
        setPlanTasks(prev => prev.map(x => x.id === t.id ? tickPomodoro(x, delta, pomoRef.current).task : x))
        if (r.studied > 0) setUserStudyTime(p => p + r.studied)
        setBotTimes(prev => prev.map((bt, i) => bots[i]?.isStudying ? bt + delta : bt))
        afterPomodoroTickRef.current(t, r)
        return
      }
      setPlanTasks(prev => prev.map(x => x.id === selectedTaskId && x.mode === 'regular' ? { ...x, regularElapsed: x.regularElapsed + delta } : x))
      setUserStudyTime(p => p + delta)
      setBotTimes(prev => prev.map((bt, i) => bots[i]?.isStudying ? bt + delta : bt))
    }, 250)
    return () => clearInterval(id)
  }, [focusRunning, selectedTaskId, bots])

  // Safety net for a Pomodoro left sitting at 00:00 by the pre-breaks engine: pause instead of
  // sitting there "running", and close the backend session. (Current tasks roll into their break.)
  useEffect(() => {
    if (!focusRunning || !selectedTask) return
    if (selectedTask.mode === 'pomodoro' && selectedTask.pomodoroRemaining <= 0) {
      setFocusRunning(false)
      stopRemoteSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRunning, selectedTask?.id, selectedTask?.mode, selectedTask?.pomodoroRemaining])

  // Untouched Pomodoro sessions follow the saved settings (also when they arrive from the backend late).
  useEffect(() => {
    setPlanTasks(prev => applyPomodoroSettings(prev, pomo, focusRunning ? selectedTaskId : null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomo.focusMinutes, pomo.breakMinutes])

  // Write progress back to the shared Focus Lock snapshot so both screens stay in step.
  // Skipped until something actually changes: an untouched room must not create an empty
  // snapshot that would stop Focus Lock from seeding its plan from real data.
  useEffect(() => {
    const untouched = planTasks === initial.tasks && selectedTaskId === initial.selectedTaskId && focusRunning === initial.running
    if (untouched) return
    saveFocusPlanSnapshot({ tasks: planTasks, activeTaskId: selectedTaskId, running: focusRunning, runningStartedAtMs: focusRunning ? Date.now() : null })
  }, [planTasks, selectedTaskId, focusRunning, initial])

  // Plan changes from elsewhere (another tab/device, the first load from
  // Supabase) replace this room's copy - otherwise the save above would write
  // the old list back and undo them. Same rule as FocusLockPage: a task this
  // room is itself running keeps its own clock.
  const selectedTaskIdRef = useRef(selectedTaskId)
  selectedTaskIdRef.current = selectedTaskId
  const focusRunningRef = useRef(focusRunning)
  focusRunningRef.current = focusRunning
  useEffect(() => subscribePlan(source => {
    if (source !== 'remote') return
    const remote = loadFocusPlanSnapshot()
    if (!remote) return
    const next = mergeRemotePlan(remote, { tasks: tasksRef.current, activeTaskId: selectedTaskIdRef.current, running: focusRunningRef.current }, advanceTask(pomoRef.current))
    if (next.stopHere) stopRemoteSession()
    setPlanTasks(next.tasks)
    setSelectedTaskId(next.activeTaskId ?? next.tasks[0]?.id ?? null)
    setFocusRunning(next.running)
  }), [stopRemoteSession])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, live.messages])

  const chatLocked = focusRunning

  const f2 = (n: number) => String(n).padStart(2, '0')
  const fmtStudyTime = (secs: number) => {
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60)
    return h > 0 ? `${h}h ${f2(m)}m` : `${m}m`
  }

  async function pauseFocus() {
    if (!focusRunningRef.current || togglingRef.current) return
    togglingRef.current = true
    try {
      setFocusRunning(false)
      await stopRemoteSession()
    } finally {
      togglingRef.current = false
    }
  }

  // Runs `action` now if the timer isn't running; otherwise only after the
  // pause reflection is unlocked.
  function afterPauseBarrier(action: () => void) {
    if (focusRunningRef.current) setPausePrompt({ run: action })
    else action()
  }

  async function toggleFocus() {
    if (!selectedTask || togglingRef.current) return
    if (focusRunning) {
      afterPauseBarrier(() => void pauseFocus())
      return
    }
    togglingRef.current = true
    try {
      if (selectedTask.mode === 'pomodoro' && selectedTask.pomodoroRemaining <= 0) {
        // A Pomodoro left sitting at 00:00 (from before breaks existed) starts over fresh.
        setPlanTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, ...pomodoroFields(pomo) } : t))
      }
      setFocusRunning(true)
      // A break isn't study time: only focus phases (and Regular) open a backend study session.
      const startingBreak = selectedTask.mode === 'pomodoro' && pomoPhase(selectedTask) === 'break'
      if (!startingBreak) {
        try { await startRemoteSession(selectedTask.subject) } catch { /* hook already falls back to a local-only clock */ }
      }
    } finally {
      togglingRef.current = false
    }
  }

  function selectTask(id: string) {
    if (id === selectedTaskId) return
    // Progress on the task being left is kept; the new one is ready to Start.
    // Switching stops the running timer, so it goes through the pause barrier.
    afterPauseBarrier(() => {
      if (focusRunningRef.current) { setFocusRunning(false); stopRemoteSession() }
      setSelectedTaskId(id)
    })
  }

  function resetSelectedTask() {
    if (!selectedTask) return
    const taskId = selectedTask.id
    afterPauseBarrier(() => {
      if (focusRunningRef.current) { setFocusRunning(false); stopRemoteSession() }
      setPlanTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t
        return t.mode === 'pomodoro' ? { ...t, ...pomodoroFields(pomo) } : { ...t, regularElapsed: 0 }
      }))
    })
  }

  const visibleBots = bots.filter(b => !kickedIds.has(b.id))
  const studyingCount = isRealRoom
    ? live.members.filter(m => (m.is_me ? focusRunning : m.is_live)).length + (focusRunning && !live.members.some(m => m.is_me) ? 1 : 0)
    : visibleBots.filter(b => b.isStudying).length + (focusRunning || userStudyTime > 0 ? 1 : 0)

  async function sendMessage() {
    const txt = chatInput.trim()
    if (!txt) return
    if (isRealRoom) {
      if (!live.myId || sending) return
      setSending(true)
      setChatError(null)
      try {
        await sendRoomMessage(room.groupId!, live.myId, txt)
        setChatInput('') // the message itself arrives through realtime
      } catch (e) {
        setChatError((e as Error).message)
      } finally {
        setSending(false)
      }
      return
    }
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
    id: 'user', name: `You (${selfName.split(/\s+/)[0]})`, initials: selfInitials,
    subject: selectedTask ? `${selectedTask.subject} — ${selectedTask.topic}` : (room.subject === 'All Subjects' ? 'Physics' : room.subject),
    studyTimeSecs: userStudyTime,
    // Live only while the clock is actually running; paused (not offline)
    // once time's been banked but the play/pause button has been toggled
    // off — the card should track the real button, not just "> 0 secs".
    isStudying: focusRunning,
    isPaused: !focusRunning && userStudyTime > 0,
    cardGrad: 'linear-gradient(160deg,#1A0F35,#2D1555,#3D1870)',
    accentColor: '#7C4DFF',
  }

  // Real room: one card per member, from room_members (today's study time,
  // live/paused state and subject come from their study_sessions). Times tick
  // locally between refreshes for whoever is live.
  const memberCards: (BotParticipant & { avatarUrl?: string; userId?: string })[] = live.members.map((m: RoomMember) => {
    const liveNow = m.is_me ? focusRunning : m.is_live
    const secs = m.today_seconds + (m.is_live ? Math.max(0, Math.floor((nowMs - live.fetchedAt) / 1000)) : 0)
    const look = BOT_POOL[hashSubject(m.user_id) % BOT_POOL.length]
    const first = m.name.trim().split(/\s+/)[0] || m.name
    return {
      id: m.is_me ? 'user' : m.user_id, userId: m.user_id,
      name: m.is_me ? `You (${selfName.split(/\s+/)[0]})` : m.name,
      initials: (m.is_me ? selfInitials : m.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()) || first.slice(0, 2).toUpperCase(),
      subject: m.is_me ? userCard.subject : (m.subject || (liveNow ? 'Studying' : room.subject)),
      studyTimeSecs: secs,
      isStudying: liveNow,
      isPaused: m.is_me ? (!focusRunning && secs > 0) : m.is_paused,
      cardGrad: m.is_me ? userCard.cardGrad : look.cardGrad,
      accentColor: m.is_me ? userCard.accentColor : look.accentColor,
      isMe: m.is_me,
      avatarUrl: m.is_me ? userAvatar : (m.avatar_url ?? undefined),
    }
  })
  const amAdmin = live.members.some(m => m.is_me && m.role === 'admin')
  const memberNames = new Map(live.members.map(m => [m.user_id, m.is_me ? 'You' : m.name]))
  const realMessages: ChatMsg[] = live.messages.map(m => {
    const d = new Date(m.created_at)
    return {
      id: m.id, name: memberNames.get(m.sender_id) ?? 'Member', text: m.body,
      time: `${d.getHours()}:${f2(d.getMinutes())}`, isBot: false, isMe: m.sender_id === live.myId,
    }
  })
  const shownMessages = isRealRoom ? realMessages : messages
  const seatsLeft = isRealRoom ? (room.memberLimit ?? 50) - live.members.length : 1

  async function kick(userId: string) {
    if (!room.groupId) return
    try {
      await kickMember(room.groupId, userId)
      await live.refreshMembers()
    } catch (e) {
      setChatError((e as Error).message)
    }
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
            <Ico n="chevL" cls="w-4 h-4" /> {backLabel}
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

        <main className="flex-1 overflow-y-auto flex flex-col px-6">
          {/* Timer bar: pinned to the top of the scroll area so it can never scroll out of reach.
              flex-shrink-0 matters - main is a flex column and a shrinkable overflow-hidden child
              gets squashed to a sliver once the participant grid grows taller than the viewport. */}
          <div className="sticky top-0 z-20 -mx-6 px-6 pt-5 pb-5 flex-shrink-0 bg-[#060914]">
            <RoomFocusBar
              tasks={planTasks}
              selectedTask={selectedTask}
              running={focusRunning}
              focusSecs={focusSecsOf(pomo)}
              onSelectTask={selectTask}
              onToggle={toggleFocus}
              onReset={resetSelectedTask}
              onOpenFocusLock={() => onNavigate('focus')}
            />
          </div>

          {/* Tabs */}
          <div className="flex-shrink-0 mb-5 flex rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1A2845]"
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
          <div className="flex-1 pb-6">
            {activeTab === 'studying' && isRealRoom && live.status === 'loading' && (
              <div className="py-16 text-center text-slate-500 text-sm">Loading who's studying…</div>
            )}
            {activeTab === 'studying' && isRealRoom && live.status === 'error' && (
              <div className="py-16 text-center">
                <div className="text-slate-300 font-semibold mb-1">Couldn't load this room</div>
                <div className="text-slate-500 text-sm mb-4">{live.error}</div>
                <button onClick={() => void live.refreshMembers()}
                  className="px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 bg-[#7C4DFF]">Try again</button>
              </div>
            )}
            {activeTab === 'studying' && isRealRoom && live.status === 'ready' && (
              <div className="grid grid-cols-3 gap-5">
                {memberCards.map(p => (
                  <BotCard key={p.id}
                    bot={p}
                    canKick={amAdmin && !p.isMe}
                    onKick={() => p.userId && void kick(p.userId)}
                    avatarUrl={p.avatarUrl}
                  />
                ))}
                {seatsLeft > 0 && (
                  <div className="rounded-2xl border overflow-hidden flex flex-col items-center justify-center py-10 cursor-pointer hover:border-violet-500/30 transition-colors"
                    style={{ background: '#0B1530', borderColor: 'rgba(26,40,69,0.55)', borderStyle: 'dashed' }}>
                    <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center mb-3 border-[#1E3060]">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </div>
                    <div className="text-slate-300 font-semibold text-sm">Seat Available</div>
                    <div className="text-slate-500 text-xs mt-0.5">Invite a friend to study</div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'studying' && !isRealRoom && (
              <div className="grid grid-cols-3 gap-5">
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
                    <button onClick={() => { if (focusRunning) toggleFocus() }}
                      className="mt-2 px-6 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.55), 0 0 40px rgba(92,53,204,0.25)' }}>
                      Pause & Open Chat
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-3 pb-3" style={{ minHeight: '300px' }}>
                      {isRealRoom && shownMessages.length === 0 && (
                        <div className="py-12 text-center text-slate-500 text-sm">No messages yet. Say hi 👋</div>
                      )}
                      {shownMessages.map(msg => (
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
                        onChange={e => { setChatInput(e.target.value); setChatError(null) }}
                        onKeyDown={e => e.key === 'Enter' && void sendMessage()}
                        maxLength={2000}
                      />
                      <button onClick={() => void sendMessage()} disabled={sending}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all hover:opacity-90 flex-shrink-0 bg-[#7C4DFF]"
                        >
                        <Ico n="arrow" cls="w-4 h-4" />
                      </button>
                    </div>
                    {chatError && <div className="text-[11px] text-red-400 mt-1.5">{chatError}</div>}
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
      {pausePrompt && (
        <PauseReflectionModal
          onClose={() => setPausePrompt(null)}
          onUnlock={() => { const p = pausePrompt; setPausePrompt(null); p.run() }} />
      )}
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

// ─── Schedule AI chat ─────────────────────────────────────────────────────────
// "Generate with AI" on the Schedules page opens this chat dialog (it replaced
// the old subjects / exam / hours form). UI only for now: a sent message shows
// the student's bubble, then a typing indicator, then a placeholder reply from
// the mascot. The one place to plug the real assistant in is send() below.
interface AIChatMsg { id: number; from: 'bot' | 'user'; text: string }

const AI_CHAT_GREETING = 'Hi! I’m your Wynko study assistant. Tell me your subjects, your target exam and how many hours you can study each day, and I’ll help you build your schedule.'

// The Wynko mascot as a round avatar (header, every bot message, typing indicator).
function MascotAvatar({ size }: { size: number }) {
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: 'rgba(124,77,255,0.14)', border: '1px solid rgba(124,77,255,0.4)', boxShadow: '0 0 14px rgba(124,77,255,0.35)' }}>
      <img src={wynkoMascot} alt="" className="w-auto object-contain" style={{ height: '78%' }} />
    </div>
  )
}

function ScheduleAIChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<AIChatMsg[]>([{ id: 1, from: 'bot', text: AI_CHAT_GREETING }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(2)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, typing])
  useEffect(() => () => { if (replyTimer.current) clearTimeout(replyTimer.current) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function send() {
    const text = input.trim()
    if (!text || typing) return
    setMessages(m => [...m, { id: nextId.current++, from: 'user', text }])
    setInput('')
    setTyping(true)
    // TODO(backend): replace this stub with the real assistant call. Append its
    // answer as { from: 'bot' } and setTyping(false) when it arrives.
    replyTimer.current = setTimeout(() => {
      setMessages(m => [...m, { id: nextId.current++, from: 'bot', text: 'I can’t build schedules just yet. I’m still being connected, so please check back soon!' }])
      setTyping(false)
    }, 1100)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.8)] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Wynko AI assistant"
        className="rounded-2xl border w-[520px] max-w-full h-[620px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>

        {/* Header */}
        <div className="flex items-center gap-3.5 px-5 py-4 border-b flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#0F1535,#141B40)', borderColor: '#1A2845' }}>
          <MascotAvatar size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-violet-400 font-mono tracking-[0.15em] mb-0.5">AI ASSISTANT</div>
            <div className="text-base font-bold text-white leading-tight">Create Your Study Schedule</div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} /> Online
            </div>
          </div>
          <button onClick={onClose} aria-label="Close chat"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors flex-shrink-0">
            <Ico n="close" cls="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {messages.map(m => m.from === 'bot' ? (
            <div key={m.id} className="flex items-end gap-2.5">
              <MascotAvatar size={34} />
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-md text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap break-words border"
                style={{ background: 'rgba(14,21,40,0.85)', borderColor: '#1A2845' }}>{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-[13px] text-white leading-relaxed whitespace-pre-wrap break-words"
                style={{ background: 'linear-gradient(135deg,#7C4DFF,#6B44EE)', boxShadow: '0 0 16px rgba(124,77,255,0.35)' }}>{m.text}</div>
            </div>
          ))}
          {typing && (
            <div className="flex items-end gap-2.5">
              <MascotAvatar size={34} />
              <div className="px-4 py-3.5 rounded-2xl rounded-bl-md border flex items-center gap-1.5" aria-label="Assistant is typing"
                style={{ background: 'rgba(14,21,40,0.85)', borderColor: '#1A2845' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-t flex-shrink-0" style={{ borderColor: '#1A2845' }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Type your subjects, exam and study hours…"
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border bg-transparent text-sm text-slate-200 outline-none placeholder-slate-600 focus:border-violet-500/50 transition-colors border-[#1A2845]" />
          <button onClick={send} disabled={!input.trim() || typing} aria-label="Send message"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition-all enabled:hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#7C4DFF', boxShadow: '0 0 20px rgba(124,77,255,0.45)' }}>
            <Ico n="arrow" cls="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SchedulesPage({ onNavigate, schedule, setSchedule, sharedUnits, setSharedUnits, profile, embedded = false, title: scheduleTitle = 'Your Schedule', subtitle: scheduleSubtitle = 'Stay consistent. Track your progress.' }: {
  onNavigate: (id: string) => void
  schedule: ScheduleItem[][]
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[][]>>
  sharedUnits: StudyUnit[]
  setSharedUnits: React.Dispatch<React.SetStateAction<StudyUnit[]>>
  profile?: ProfileInfo
  // Embedded = just the schedule editor (AI banner + week editor), without the
  // page shell, the title or the blocker sections. The WynkoHead's Schedule tab
  // uses it to edit the schedule they publish to students.
  embedded?: boolean
  title?: string
  subtitle?: string
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

  const pageBody = (
    <>
      {!embedded && (
          <div>
            <h1 className="text-2xl font-bold text-white">Schedule & Blockers</h1>
            <p className="text-slate-400 text-sm mt-0.5">Build your perfect study routine and stay distraction-free.</p>
          </div>
      )}

          {/* ── AI Assistant Banner ── */}
          <div className="rounded-2xl border p-5 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#0F1535,#141B40)', borderColor: '#2855CC', boxShadow: '0 0 40px rgba(124,77,255,0.25), 0 0 80px rgba(40,85,204,0.1)' }}>
            <div className="absolute right-0 top-0 bottom-0 w-40 opacity-15 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at right,#7C4DFF,transparent)' }} />
            <div className="flex items-center gap-5 relative">
              <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center">
                <img src={wynkoMascot} alt="Wynko mascot" className="h-full w-auto object-contain"
                  style={{ filter: 'drop-shadow(0 0 14px rgba(124,77,255,0.45))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-violet-400 font-mono tracking-[0.15em] mb-0.5">AI ASSISTANT</div>
                <div className="text-lg font-bold text-white mb-0.5">Create Your Study Schedule</div>
                <div className="text-sm text-slate-400 leading-relaxed">Tell us your subjects, goals and available time. Our AI will build a personalized plan for you.</div>
              </div>
              <button onClick={() => setShowAI(true)}
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
                  <div className="text-base font-bold text-white">{scheduleTitle}</div>
                  <div className="text-[11px] text-slate-500">{scheduleSubtitle}</div>
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
                  {!embedded && (
                    <>
                      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white flex-shrink-0 transition-all hover:opacity-90"
                        style={{ background: '#7C4DFF', boxShadow: '0 0 12px rgba(124,77,255,0.45)' }}>
                        🎯 Focus Mode
                      </button>
                      <Ico n="chevR" cls="w-4 h-4 text-slate-600" />
                    </>
                  )}
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

      {!embedded && (
        <>
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
        </>
      )}
    </>
  )

  const modals = (
    <>
      {/* ── AI assistant chat ── */}
      {showAI && <ScheduleAIChat onClose={() => setShowAI(false)} />}

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
    </>
  )

  if (embedded) return <div className="space-y-5">{pageBody}{modals}</div>

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
          {pageBody}
        </main>
      </div>

      {modals}
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

function EarnPage({ onNavigate, profile, headStatus, hasCommunity, onApply, onCreateCommunity }: {
  onNavigate: (id: string) => void
  profile?: ProfileInfo
  // From the App root (user_profiles revhead_* columns + my_communities):
  // registering submits an application that an admin reviews; once verified,
  // the WynkoHead creates their community and the sidebar's Community opens
  // the management dashboard.
  headStatus: WynkoHeadStatus | null
  hasCommunity: boolean
  onApply: () => Promise<string | null>
  onCreateCommunity: (name: string, description: string) => Promise<string | null>
}) {
  const isWynkoHead = !!headStatus?.verified
  const applicationPending = headStatus?.application === 'pending'
  const applicationRejected = headStatus?.application === 'rejected'
  const [earnError, setEarnError] = useState<string | null>(null)
  const [earnBusy, setEarnBusy] = useState(false)
  type EarnTab = "wynkohead" | "invite"
  const [tab, setTab] = useState<EarnTab>("wynkohead")
  const [inLibrary, setInLibrary] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [regName, setRegName] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [friendCopied, setFriendCopied] = useState(false)
  const [headLinkCopied, setHeadLinkCopied] = useState(false)
  const [communityMembers, setCommunityMembers] = useState<{ name: string; joined: string }[]>([])
  const [simName, setSimName] = useState("")

  // A WynkoHead's community — name & description they set once, via the
  // "Create your community" dialog below (rpc_create_community).
  const communityCreated = hasCommunity
  const [showCreateCommunity, setShowCreateCommunity] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDesc, setCreateDesc] = useState("")

  const friendLink = "wynko.in/ref/jatin123"
  const wynkoHeadLink = "wynko.in/wh/jatin-sinsinwar"
  const wynkoins = 150

  function copyFriend() { navigator.clipboard?.writeText(friendLink); setFriendCopied(true); setTimeout(() => setFriendCopied(false), 2000) }
  function copyHeadLink() { navigator.clipboard?.writeText(wynkoHeadLink); setHeadLinkCopied(true); setTimeout(() => setHeadLinkCopied(false), 2000) }

  async function handleRegister() {
    if (!regName.trim() || earnBusy) return
    setEarnBusy(true)
    setEarnError(null)
    const err = await onApply()
    setEarnBusy(false)
    if (err) { setEarnError(err); return }
    setRegistering(false)
  }

  async function handleCreateCommunity() {
    if (!createName.trim() || earnBusy) return
    setEarnBusy(true)
    setEarnError(null)
    const err = await onCreateCommunity(createName.trim(), createDesc.trim())
    setEarnBusy(false)
    if (err) { setEarnError(err); return }
    setShowCreateCommunity(false)
    onNavigate("studyrooms")
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
            {communityCreated && (
              <button onClick={() => onNavigate("studyrooms")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-all border-[#1E3060]">
                👑 Visit your community
              </button>
            )}
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

                {/* Community revenue detail */}
                <div className="rounded-2xl border p-5 bg-[#0B1530] border-[#1A2845]" >
                  <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-3">REVENUE BREAKDOWN — EXAMPLE</div>
                  <div className="mb-3 px-3 py-2 rounded-lg text-[10px] font-mono" style={{ background: "rgba(245,158,11,0.07)", color: "#FCD34D", border: "1px solid rgba(245,158,11,0.2)" }}>
                    ⚠ THESE ARE EXAMPLE EARNINGS — YOUR ACTUAL NUMBERS WILL APPEAR AS YOUR COMMUNITY GROWS
                  </div>
                  <div className="flex gap-3 mb-3">
                    {[
                      { icon: "👥", label: "Community purchases", price: "₹1,200", earn: "₹600", note: "50% share" },
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
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { label: "Members", val: String(communityMembers.length), color: "#C4AAFF" },
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
          {isWynkoHead && communityCreated && (
            <button onClick={() => onNavigate("studyrooms")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold text-violet-300 hover:bg-violet-500/10 transition-all border-[#1E3060]">
              👑 Visit your community
            </button>
          )}
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
              <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-5">Build your own community of students on Wynko. Earn 50% revenue share on every purchase your students make. Or simply invite friends and earn WYNKOINS together.</p>
              <div className="flex gap-6 flex-wrap">
                {[
                  { icon: "👑", v: "50%", label: "Revenue from your community" },
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
                      { n: "3", icon: "👑", title: "Create Your Community", desc: "Give your community a name and description, then manage it, publish schedules, and track earnings from your dashboard." },
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
                {earnError && (
                  <div className="mb-3 px-4 py-2.5 rounded-xl border text-[13px] text-amber-300" style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.25)' }}>{earnError}</div>
                )}
                {!isWynkoHead && applicationPending ? (
                  <div className="rounded-2xl border p-6 bg-[#0B1530] border-[#1E3060]">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">APPLICATION RECEIVED</div>
                    <div className="text-lg font-black text-white mb-1">Your WynkoHead application is under review</div>
                    <div className="text-[12px] text-slate-400">We’ll verify your details. Once approved, you can create your community here and start earning.</div>
                  </div>
                ) : !isWynkoHead ? (
                  <div className="rounded-2xl border overflow-hidden bg-[#0B1530] border-[#1E3060]" >
                    {!registering ? (
                      <div className="p-6 flex items-center justify-between gap-6">
                        <div>
                          <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-1">READY TO START?</div>
                          <div className="text-lg font-black text-white mb-1">Register as a WynkoHead</div>
                          <div className="text-[12px] text-slate-400">{applicationRejected
                            ? 'Your previous application wasn’t approved. You can apply again.'
                            : 'Apply to unlock your community dashboard, share your invite link, and start earning 50% revenue share.'}</div>
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
                            <button onClick={() => void handleRegister()} disabled={earnBusy}
                              className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
                              style={{ background: regName.trim() ? "linear-gradient(135deg,#7C4DFF,#6B44EE)" : "#0B1530", opacity: regName.trim() ? 1 : 0.5 }}>
                              Complete Registration →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : !communityCreated ? (
                  <button onClick={() => setShowCreateCommunity(true)}
                    className="w-full flex items-center justify-between px-6 py-4 rounded-2xl border transition-all hover:scale-[1.01]"
                    style={{ background: "linear-gradient(135deg,rgba(26,40,69,0.55),rgba(79,70,229,0.12))", borderColor: "#2855CC", boxShadow: "0 0 32px rgba(124,77,255,0.25)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#1A2845", border: "1px solid #4A3A88" }}>🏘️</div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-white">Create your community</div>
                        <div className="text-[11px] text-slate-400">Give it a name & description to get started</div>
                      </div>
                    </div>
                    <Ico n="chevR" cls="w-5 h-5 text-violet-400" />
                  </button>
                ) : (
                  <div className="flex gap-3 flex-wrap">
                    <button onClick={() => onNavigate("studyrooms")}
                      className="flex-1 min-w-[260px] flex items-center justify-between px-6 py-4 rounded-2xl border transition-all hover:scale-[1.01]"
                      style={{ background: "linear-gradient(135deg,rgba(26,40,69,0.55),rgba(79,70,229,0.12))", borderColor: "#2855CC", boxShadow: "0 0 32px rgba(124,77,255,0.25)" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#1A2845", border: "1px solid #4A3A88" }}>👑</div>
                        <div className="text-left">
                          <div className="text-sm font-bold text-white">Visit your community</div>
                          <div className="text-[11px] text-slate-400">Manage students, schedule & earnings</div>
                        </div>
                      </div>
                      <Ico n="chevR" cls="w-5 h-5 text-violet-400" />
                    </button>
                    <button onClick={() => setInLibrary(true)}
                      className="flex-1 min-w-[260px] flex items-center justify-between px-6 py-4 rounded-2xl border transition-all hover:scale-[1.01]"
                      style={{ background: "rgba(26,40,69,0.30)", borderColor: "#1E3060" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#1A2845", border: "1px solid #4A3A88" }}>🔗</div>
                        <div className="text-left">
                          <div className="text-sm font-bold text-white">Open WynkoHead Library</div>
                          <div className="text-[11px] text-slate-400">{communityMembers.length} community members · invite links</div>
                        </div>
                      </div>
                      <Ico n="chevR" cls="w-5 h-5 text-violet-400" />
                    </button>
                  </div>
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
      {showCreateCommunity && (
        <CreateCommunityDialog
          name={createName} setName={setCreateName}
          description={createDesc} setDescription={setCreateDesc}
          onCreate={() => void handleCreateCommunity()}
          onCancel={() => setShowCreateCommunity(false)} />
      )}
    </div>
  )
}

// Name + description dialog shown once, right after registering as a
// WynkoHead — submitting creates the community (rpc_create_community; the same
// HeadManageTab / WynkoHeadCommunityPage read from) and sends the person
// straight into the Community module.
function CreateCommunityDialog({ name, setName, description, setDescription, onCreate, onCancel }: {
  name: string; setName: (v: string) => void
  description: string; setDescription: (v: string) => void
  onCreate: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.75)] p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-label="Create your community" className="rounded-2xl border p-7 w-[440px] max-w-full"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
        <div className="text-[10px] font-mono tracking-[0.2em] text-violet-400 mb-2">CREATE YOUR COMMUNITY</div>
        <div className="text-lg font-bold text-white mb-1.5">Name your community</div>
        <div className="text-[13px] text-slate-400 mb-5 leading-relaxed">This is what your students will see. You can change it later from Manage Community.</div>
        <div className="space-y-3.5">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">Community name *</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus
              placeholder="e.g. JEE 2026 Grind Room"
              className={HEAD_INPUT} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={200} rows={3}
              placeholder="What is this community about, and who is it for?"
              className={HEAD_INPUT + " resize-none"} />
          </label>
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">Cancel</button>
          <button onClick={onCreate} disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7C4DFF,#6B44EE)', boxShadow: '0 0 16px #1E3060' }}>
            Create Community →
          </button>
        </div>
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

// ─── Quick Timer ────────────────────────────────────────────────────────────
// A completely standalone countdown, separate from Focus Lock's task/session
// system on purpose - no subject, no topic, no backend session, nothing to set
// up. Land on it and it's already got a duration loaded (last one used, or 30
// minutes the very first time); tap the clock face any time - running or not -
// to change how long is left, same "click the number to edit it" mechanism as
// bigtimer-style countdown apps. Persisted as an end timestamp (not a plain
// tick counter) so it stays accurate if the tab is backgrounded or this page
// is left and come back to.
const QT_STORE_KEY = 'wynko_quick_timer_v1'
const QT_DEFAULT_SECONDS = 30 * 60

type QuickTimerState = {
  totalSeconds: number
  remainingSeconds: number // while running: the value when this run started
  running: boolean
  endAt: number | null
  loggedSeconds?: number   // seconds of the current run already saved as study time
}

function loadQuickTimer(): QuickTimerState {
  const saved = Store.get(QT_STORE_KEY, null) as QuickTimerState | null
  if (!saved || typeof saved.totalSeconds !== 'number') {
    return { totalSeconds: QT_DEFAULT_SECONDS, remainingSeconds: QT_DEFAULT_SECONDS, running: false, endAt: null }
  }
  return saved
}
function saveQuickTimer(s: QuickTimerState) { Store.set(QT_STORE_KEY, s) }
function qtRemainingNow(s: QuickTimerState): number {
  if (s.running && s.endAt) return Math.max(0, Math.round((s.endAt - Date.now()) / 1000))
  return s.remainingSeconds
}
// Saves the part of the current run not saved yet as study time (study_log),
// returning the state with that recorded. Used every minute while running
// and whenever a run pauses, finishes, resets or changes duration - so the
// Quick Timer counts on Your Study Progress without any extra step.
function qtSaveStudyTime(s: QuickTimerState): QuickTimerState {
  if (!s.running || !s.endAt) return s
  const ran = Math.max(0, s.remainingSeconds - qtRemainingNow(s))
  const unsaved = ran - (s.loggedSeconds ?? 0)
  if (unsaved <= 0) return s
  logStudyTime(QUICK_TIMER_SUBJECT, unsaved)
  return { ...s, loggedSeconds: ran }
}
// For when the Quick Timer page isn't open: a run keeps going in the
// background (it's an end timestamp), so save its progress / finish it here.
function settleQuickTimerInBackground() {
  const saved = Store.get(QT_STORE_KEY, null) as QuickTimerState | null
  if (!saved?.running) return
  let next = qtSaveStudyTime(saved)
  if (qtRemainingNow(next) <= 0) next = { ...next, running: false, remainingSeconds: 0, endAt: null, loggedSeconds: 0 }
  if (next !== saved) saveQuickTimer(next)
}

// Click-the-clock-to-edit picker. Three plain hour/minute/second spinners -
// no presets, no modes, just "how long" - reusing TimeSpinner as-is.
function QuickTimerDurationPicker({ initialSeconds, onClose, onSet }: {
  initialSeconds: number; onClose: () => void; onSet: (totalSeconds: number) => void
}) {
  const [h, setH] = useState(Math.floor(initialSeconds / 3600))
  const [m, setM] = useState(Math.floor((initialSeconds % 3600) / 60))
  const [s, setS] = useState(initialSeconds % 60)
  const total = h * 3600 + m * 60 + s
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" className="w-[380px] max-w-full rounded-2xl border p-6"
        style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 0 60px rgba(124,77,255,0.35), 0 0 120px rgba(40,85,204,0.15)' }}>
        <div className="text-center mb-5">
          <div className="text-[10px] text-violet-400 font-mono tracking-[0.2em] mb-1.5">QUICK TIMER</div>
          <div className="text-lg font-semibold text-slate-100">Set duration</div>
        </div>
        <div className="flex items-center justify-center gap-3">
          <TimeSpinner label="HOURS" value={h} onChange={setH} max={23} />
          <div className="text-2xl text-slate-600 pb-6">:</div>
          <TimeSpinner label="MIN" value={m} onChange={setM} max={59} />
          <div className="text-2xl text-slate-600 pb-6">:</div>
          <TimeSpinner label="SEC" value={s} onChange={setS} max={59} />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border text-sm text-slate-400 hover:text-slate-200 transition-colors border-[#1A2845]">
            Cancel
          </button>
          <button onClick={() => total > 0 && onSet(total)} disabled={total <= 0}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)', boxShadow: '0 0 24px rgba(41,98,255,0.5), 0 0 48px rgba(34,211,238,0.2)' }}>
            Set Timer
          </button>
        </div>
      </div>
    </div>
  )
}

// Deliberately plain: flat Wynko-navy background only, no mountain
// silhouette, no ribbon/chrome around the ring - just the countdown and
// its controls, same as a dedicated kitchen-timer app.
function QuickTimerPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [state, setState] = useState<QuickTimerState>(loadQuickTimer)
  const [remaining, setRemaining] = useState(() => qtRemainingNow(state))
  const [showPicker, setShowPicker] = useState(false)
  // Latest state for the 1s tick and the unmount save, which would otherwise
  // hold the state from when they were created (and save a minute twice).
  const stateRef = useRef(state)
  stateRef.current = state
  function commit(next: QuickTimerState) {
    stateRef.current = next
    setState(next); saveQuickTimer(next)
  }

  useEffect(() => {
    if (!state.running) { setRemaining(state.remainingSeconds); return }
    const tick = () => {
      const cur = stateRef.current
      const r = qtRemainingNow(cur)
      setRemaining(r)
      if (r <= 0) {
        commit({ ...qtSaveStudyTime(cur), running: false, remainingSeconds: 0, endAt: null, loggedSeconds: 0 })
        return
      }
      const ran = cur.remainingSeconds - r
      if (ran - (cur.loggedSeconds ?? 0) >= 60) commit(qtSaveStudyTime(cur))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.running, state.endAt])

  // Leaving the page (or closing the tab) mid-run: save what ran so far; the
  // run itself carries on in the background (see settleQuickTimerInBackground).
  useEffect(() => {
    const saveNow = () => {
      const next = qtSaveStudyTime(stateRef.current)
      if (next !== stateRef.current) { stateRef.current = next; saveQuickTimer(next) }
    }
    window.addEventListener('pagehide', saveNow)
    return () => { window.removeEventListener('pagehide', saveNow); saveNow() }
  }, [])

  function start() {
    if (remaining <= 0) { setShowPicker(true); return }
    commit({ ...state, running: true, endAt: Date.now() + remaining * 1000, remainingSeconds: remaining, loggedSeconds: 0 })
  }
  function pause() {
    const r = qtRemainingNow(state)
    commit({ ...qtSaveStudyTime(stateRef.current), running: false, endAt: null, remainingSeconds: r, loggedSeconds: 0 })
    setRemaining(r)
  }
  function reset() {
    commit({ ...qtSaveStudyTime(stateRef.current), running: false, endAt: null, remainingSeconds: state.totalSeconds, loggedSeconds: 0 })
    setRemaining(state.totalSeconds)
  }
  // Mid-session or not, tapping the clock face and setting a new duration
  // always takes effect immediately - if it was running, it keeps running
  // with the new total; if it was paused, it stays paused at the new total.
  function applyDuration(totalSeconds: number) {
    const saved = qtSaveStudyTime(stateRef.current)
    commit(state.running
      ? { ...saved, totalSeconds, remainingSeconds: totalSeconds, endAt: Date.now() + totalSeconds * 1000, loggedSeconds: 0 }
      : { ...saved, totalSeconds, remainingSeconds: totalSeconds, endAt: null, loggedSeconds: 0 })
    setRemaining(totalSeconds); setShowPicker(false)
  }

  const timeStr = formatClock(remaining, remaining >= 3600 || state.totalSeconds >= 3600)

  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ background: '#080A12' }}>
      <header className="h-14 flex items-center px-6 gap-4 border-b flex-shrink-0 bg-[rgba(6,13,26,0.97)] border-[rgba(26,40,69,0.55)]">
        <button onClick={() => onNavigate('home')}
          className="flex items-center gap-1.5 text-sm transition-colors text-[#A5AEC2] hover:text-[#F3F4F6]">
          <Ico n="chevL" cls="w-4 h-4" /> Home
        </button>
        <div className="text-[10px] tracking-[0.18em] text-[#68728A]">QUICK TIMER</div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        {/* Plain countdown only - no ring/progress chrome, just big digits. */}
        <button onClick={() => setShowPicker(true)} title="Tap to set the time" aria-label="Set timer duration"
          className="bg-transparent border-none p-0 leading-none tabular-nums"
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#F1F5F9',
            fontSize: 'min(19vh, 15vw, 160px)', letterSpacing: '-0.02em',
          }}>
          {timeStr}
        </button>

        <div className="text-xs text-slate-500">{remaining <= 0 ? 'Tap the timer to set a duration' : 'Tap the timer to change the time'}</div>

        <div className="flex items-center gap-4">
          <button onClick={reset} title="Reset" aria-label="Reset timer"
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#1A2845', color: '#C7D2FE' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12a8 8 0 0113.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 01-13.7 5.6L4 16M4 20v-4h4" />
            </svg>
          </button>
          <button onClick={() => (state.running ? pause() : start())}
            title={state.running ? 'Pause' : 'Start'} aria-label={state.running ? 'Pause timer' : 'Start timer'}
            className="w-16 h-16 rounded-full flex items-center justify-center text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #2979FF 0%, #22D3EE 100%)', boxShadow: '0 0 24px rgba(41,98,255,0.5), 0 0 48px rgba(34,211,238,0.2)' }}>
            {state.running
              ? <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
              : <Ico n="play" cls="w-6 h-6" />}
          </button>
          <div className="w-12" />
        </div>
      </div>

      {showPicker && (
        <QuickTimerDurationPicker initialSeconds={state.totalSeconds} onClose={() => setShowPicker(false)} onSet={applyDuration} />
      )}
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
// Who is a WynkoHead: a verified RevHead (user_profiles.is_revhead +
// revhead_status = 'verified', set by an admin after the Earn page application)
// who has created their community - see headCommunity below.

// Starts Supabase sync for the study plan + weekly schedule (and follows
// sign-in/out) before the first render reads the plan.
initStudyPlanSync()

export default function DesktopDashboard() {
  const [activeNav, setActiveNav] = useState('home')
  const [sharedUnits, setSharedUnits] = useState<StudyUnit[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[][]>(Array.from({ length: 7 }, () => []))
  const [activeRoom, setActiveRoom] = useState<RoomData | null>(null)
  // Room to run the Join flow for when Study Rooms opens: from an invite link
  // (home.html?room=<id>) or Home's Live Study Rooms card.
  const [pendingJoinRoomId, setPendingJoinRoomId] = useState<string | null>(null)
  // Community section: which community's Student View is open and which tab of
  // the Community module (Study Rooms / Communities) is showing. Communities,
  // their schedules and the WynkoHead role come from Supabase (see below).
  const [activeCommunity, setActiveCommunity] = useState<CommunityData | null>(null)
  const [studyRoomsTab, setStudyRoomsTab] = useState<'rooms' | 'communities'>('rooms')
  // What the student's own schedule was before a community schedule replaced it,
  // so "Reject" can hand it back (this visit only).
  const ownScheduleBackup = useRef<ScheduleItem[][] | null>(null)
  // WynkoHead: the schedule they're building for their students (separate from
  // their own study schedule), saved as a draft on the community.
  const [headSchedule, setHeadSchedule] = useState<ScheduleItem[][]>(() => Array.from({ length: 7 }, () => []))
  const [headUnits, setHeadUnits] = useState<StudyUnit[]>([])
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null)
  const [communityNotice, setCommunityNotice] = useState<string | null>(null)
  const [userAvatar, setUserAvatar] = useState<string>(avatar7)
  const [avatarTouched, setAvatarTouched] = useState(false)

  // Home's real data. The study plan and weekly schedule shared by Home,
  // Focus Lock, Study Rooms and Schedules are synced through studyPlanStore
  // (below), communities through lib/communities.ts; the rest (Battleground,
  // Settings, Wynkoins, Library, Earn's library/invite extras) still runs on
  // local mock state until their own module pass.
  const { authState, error: homeError, retry: retryHome, reviewItems, profile, todayFocus, weeklyStudy, totalWeekMinutes, avgWeekMinutes, loading: homeLoading, addUnit, removeUnitBySubject, markAsReviewed } = useHomeData()
  // Tasks + weekly schedule, synced with Supabase (lib/studyPlanStore.ts).
  const planStore = useStudyPlanStore()

  // ── Communities (lib/communities.ts, migration 0071) ──
  const signedIn = authState === 'ready'
  const myCommunitiesQ = useLoader(signedIn ? fetchMyCommunities : null, [] as MyCommunity[], [signedIn])
  const communitySchedulesQ = useLoader(signedIn ? fetchMyCommunitySchedules : null, [] as CommunityScheduleRow[], [signedIn])
  // A WynkoHead publishing shows up for their students right away (RLS limits
  // the feed to communities the user is in).
  useRealtimeRefresh('community_schedules', '', () => { void communitySchedulesQ.refresh() }, signedIn)
  const headStatusQ = useLoader(signedIn ? fetchMyWynkoHeadStatus : null, null as WynkoHeadStatus | null, [signedIn], 300_000)
  const communities = useMemo(() => myCommunitiesQ.data.map(toCommunityData), [myCommunitiesQ.data])
  // The community this user runs, if they're a verified WynkoHead who created one.
  const headCommunity = headStatusQ.data?.verified ? communities.find(c => c.myRole === 'admin') ?? null : null
  const refreshCommunities = async () => { await myCommunitiesQ.refresh() }

  // The weekly schedule and study units the Schedules page edits are saved to
  // the account (study_plans) instead of living only in this tab's memory.
  // Server copy -> state whenever it changes (first load, another tab/device);
  // state -> server on every edit. An account with nothing saved yet keeps
  // what this tab has (e.g. an accepted community schedule) and saves that.
  const weekReady = useRef(false)
  useEffect(() => {
    if (planStore.status === 'loading' || planStore.status === 'signed-out') { weekReady.current = false; return }
    if (planStore.week) {
      setSchedule(planStore.week.schedule)
      setSharedUnits(planStore.week.units)
    } else if (!weekReady.current) {
      setStudyWeek(schedule, sharedUnits)
    }
    weekReady.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStore.status, planStore.week])
  useEffect(() => {
    if (weekReady.current) setStudyWeek(schedule, sharedUnits)
  }, [schedule, sharedUnits])

  // Study time from the Quick Timers is queued locally first; send anything
  // left over from a previous visit (offline, tab closed mid-save).
  useEffect(() => {
    if (authState === 'ready') void flushStudyTimeQueue()
  }, [authState])
  // Invite links (roomInviteLink): home.html?room=<id> opens that room's Join
  // flow once signed in, then the parameter is dropped from the address bar.
  useEffect(() => {
    if (authState !== 'ready') return
    try {
      const url = new URL(window.location.href)
      const roomId = url.searchParams.get('room')
      // Community invite links (communityInviteLink): home.html?community=<token>
      // joins, or sends a join request when the WynkoHead approves members.
      const communityToken = url.searchParams.get('community')
      if (!roomId && !communityToken) return
      url.searchParams.delete('room')
      url.searchParams.delete('community')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      setActiveRoom(null)
      setActiveNav('studyrooms')
      if (roomId) {
        setStudyRoomsTab('rooms')
        setPendingJoinRoomId(roomId)
        return
      }
      setStudyRoomsTab('communities')
      joinCommunity({ token: communityToken! })
        .then(async r => {
          setCommunityNotice(joinStatusMessage(r.status))
          if (r.status === 'joined') await myCommunitiesQ.refresh()
        })
        .catch(e => setCommunityNotice((e as Error).message))
    } catch { /* no URL/history (tests, very old browsers): nothing to do */ }
  }, [authState])
  // A Quick Timer run keeps counting while you're elsewhere in the app; save
  // its time every minute (and finish it) from here while its page is closed.
  useEffect(() => {
    if (authState !== 'ready' || activeNav === 'quicktimer') return
    settleQuickTimerInBackground()
    const id = setInterval(settleQuickTimerInBackground, 60_000)
    return () => clearInterval(id)
  }, [authState, activeNav])

  // A real uploaded photo wins over the 6 illustrated presets, same
  // "resync until touched" pattern as Settings' displayName field -
  // once someone picks a preset in Settings this session, that choice
  // sticks even if profile re-fetches.
  useEffect(() => {
    if (!avatarTouched && profile?.avatarUrl) setUserAvatar(profile.avatarUrl)
  }, [profile?.avatarUrl, avatarTouched])

  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 })()

  // Home's "Today's Study Plan" / "Today's Focus" cards read the same live
  // Focus Lock plan FocusLockPage itself saves (studyPlanStore), so both
  // pages always agree on what's scheduled/active/completed. Re-read whenever
  // Home becomes the active page and whenever the plan changes - here, in
  // another tab or on another device (realtime) - rather than kept ticking
  // live while sitting on Home: a fresh read plus the same catch-up math
  // FocusLockPage uses is accurate without a second per-second timer.
  const [focusPlan, setFocusPlan] = useState<{ tasks: StudyTask[]; activeTaskId: string | null }>(() => {
    const snap = loadFocusPlanSnapshot()
    if (snap) return { tasks: catchUpFocusPlan(snap), activeTaskId: snap.activeTaskId }
    return { tasks: seedTasksFromRealData(sharedUnits, schedule, todayIdx, getPomodoroSettings()), activeTaskId: null }
  })
  const [autoStartTask, setAutoStartTask] = useState<{ subject: string; topic: string } | null>(null)
  const [showHomeAddTask, setShowHomeAddTask] = useState(false)
  // Home's Focus Timer preview card reads/saves the same Pomodoro settings
  // as Focus Lock (usePomodoroSettings is the shared store - see pomodoroSettings.ts).
  const { settings: homePomo } = usePomodoroSettings()

  useEffect(() => {
    if (activeNav !== 'home') return
    const snap = loadFocusPlanSnapshot()
    if (snap) setFocusPlan({ tasks: catchUpFocusPlan(snap), activeTaskId: snap.activeTaskId })
    else setFocusPlan({ tasks: seedTasksFromRealData(sharedUnits, schedule, todayIdx, getPomodoroSettings()), activeTaskId: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav, planStore.version])

  function handleNav(id: string) {
    setActiveNav(id)
    if (id !== 'studyrooms') { setActiveRoom(null); setActiveCommunity(null) }
  }

  // ── Community schedule decision ──
  // Accepting makes the WynkoHead's published schedule the student's actual
  // schedule (Schedules page, Today's Study Plan, study-room task list). Only
  // one community schedule can be followed at a time (rpc_set_schedule_choice
  // clears any other accepted one).
  const scheduleRowFor = (id: string) => communitySchedulesQ.data.find(r => r.group_id === id) ?? null
  const followingId = communitySchedulesQ.data.find(r => r.choice === 'accepted')?.group_id ?? null
  function applyCommunitySchedule(row: CommunityScheduleRow) {
    const week = normalizeWeek(row.week)
    const tag = row.group_id.slice(0, 8)
    setSchedule(week.map((day, di) => day.map(s => ({ ...s, id: `cm_${tag}_${di}_${s.id}` }))))
    // Same as the AI schedule: subjects the student doesn't track yet become study units.
    setSharedUnits(prev => {
      const all = week.flat()
      const missing = all.filter((s, i) =>
        all.findIndex(x => x.subject.toLowerCase() === s.subject.toLowerCase()) === i
        && !prev.some(u => u.subject.toLowerCase() === s.subject.toLowerCase()))
      return missing.length ? [...prev, ...missing.map(s => ({ subject: s.subject, exam: '', topics: [s.topic || 'Study session'] }))] : prev
    })
  }
  function revertToOwnSchedule() {
    setSchedule(ownScheduleBackup.current ?? Array.from({ length: 7 }, () => []))
    ownScheduleBackup.current = null
  }
  async function decideSchedule(id: string, choice: ScheduleChoice | null): Promise<boolean> {
    try {
      await setScheduleChoice(id, choice)
    } catch (e) {
      setCommunityNotice((e as Error).message)
      return false
    }
    await communitySchedulesQ.refresh()
    return true
  }
  async function acceptCommunitySchedule(id: string) {
    const row = scheduleRowFor(id)
    if (!row) return
    if (!followingId) ownScheduleBackup.current = schedule
    if (await decideSchedule(id, 'accepted')) applyCommunitySchedule(row)
  }
  async function rejectCommunitySchedule(id: string) {
    const wasFollowing = followingId === id
    if (await decideSchedule(id, 'rejected') && wasFollowing) revertToOwnSchedule()
  }
  async function leaveCommunityById(id: string) {
    try {
      await leaveCommunity(id)
    } catch (e) {
      setCommunityNotice((e as Error).message)
      return
    }
    if (followingId === id) revertToOwnSchedule()
    setActiveCommunity(null)
    await Promise.all([myCommunitiesQ.refresh(), communitySchedulesQ.refresh()])
  }

  // ── WynkoHead: schedule draft (saved on the community) + publish ──
  useEffect(() => {
    if (!headCommunity || draftReadyFor === headCommunity.id) return
    const id = headCommunity.id
    let cancelled = false
    loadScheduleDraft(id).then(d => {
      if (cancelled) return
      const published = communitySchedulesQ.data.find(r => r.group_id === id)
      if (d) setHeadSchedule(normalizeWeek(d.week))
      else if (published) setHeadSchedule(normalizeWeek(published.week))
      if (d && Array.isArray(d.units)) setHeadUnits(d.units as StudyUnit[])
      setDraftReadyFor(id)
    }).catch(e => console.warn('Community schedule draft not loaded', e))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headCommunity?.id])
  useEffect(() => {
    if (!headCommunity || draftReadyFor !== headCommunity.id) return
    const id = headCommunity.id
    const t = setTimeout(() => {
      saveScheduleDraft(id, headSchedule, headUnits).catch(e => console.warn('Community schedule draft not saved', e))
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSchedule, headUnits, draftReadyFor])
  async function publishHeadSchedule(): Promise<string | null> {
    if (!headCommunity) return 'No community to publish to'
    try {
      await publishCommunitySchedule(headCommunity.id, headSchedule)
      await communitySchedulesQ.refresh()
      return null
    } catch (e) {
      return (e as Error).message
    }
  }
  const headPublished: PublishedSchedule | undefined = (() => {
    const row = headCommunity ? scheduleRowFor(headCommunity.id) : null
    return row ? { week: normalizeWeek(row.week), publishedAt: new Date(row.published_at).getTime(), by: row.published_by_name || 'You' } : undefined
  })()
  async function applyWynkoHead(): Promise<string | null> {
    try { await applyAsWynkoHead(); await headStatusQ.refresh(); return null } catch (e) { return (e as Error).message }
  }
  async function createHeadCommunity(name: string, description: string): Promise<string | null> {
    try { await createCommunity(name, description); await myCommunitiesQ.refresh(); return null } catch (e) { return (e as Error).message }
  }

  // Opens a specific room's interior directly from Home's Live Study
  // Rooms preview - same destination StudyRoomsPage's own room cards use.
  function openRoom(room: RoomData) {
    // A real room you're not in yet goes through the Study Rooms page's Join
    // flow first (password prompt for private rooms), then opens.
    if (room.groupId && !room.isMember) {
      setActiveRoom(null)
      setActiveCommunity(null)
      setStudyRoomsTab('rooms')
      setPendingJoinRoomId(room.groupId)
      setActiveNav('studyrooms')
      return
    }
    setActiveRoom(room)
    setActiveNav('studyrooms')
  }
  // "View All" always lands on the room listing, even if a room was
  // previously open - handleNav only clears activeRoom for OTHER ids,
  // since it's what lets returning to 'studyrooms' normally reopen
  // wherever you left off.
  function viewAllRooms() {
    setActiveRoom(null)
    setActiveNav('studyrooms')
  }
  // Optional task = "jump straight into a running session for this
  // task" (used by Today's Study Plan's ▶ buttons); FocusLockPage's own
  // auto-start effect consumes autoStartTask once and reports back via
  // onAutoStartHandled.
  function goFocus(task?: { subject: string; topic: string }) {
    if (task) setAutoStartTask(task)
    setActiveNav('focus')
  }

  // Adds directly to the live Focus Lock plan (same StudyTask model, same
  // synced store) so it shows up in Today's Study Plan immediately -
  // reads the freshest snapshot first so it never clobbers a session that's
  // actually running right now.
  function handleHomeAddTask(subject: string, topic: string) {
    // Same rule as Focus Lock: no mode prompt here either - use whichever
    // mode the user last picked from the Pomodoro/Regular blocks.
    const task: StudyTask = { id: makeTaskId(), subject, topic, mode: getTimerMode(), ...pomodoroFields(getPomodoroSettings()), regularElapsed: 0 }
    const existing = loadFocusPlanSnapshot()
    const nextTasks = [task, ...(existing?.tasks ?? focusPlan.tasks)]
    saveFocusPlanSnapshot({
      tasks: nextTasks,
      activeTaskId: existing?.activeTaskId ?? focusPlan.activeTaskId,
      running: existing?.running ?? false,
      runningStartedAtMs: existing?.runningStartedAtMs ?? null,
    })
    setFocusPlan(prev => ({ ...prev, tasks: nextTasks }))
    setShowHomeAddTask(false)
  }

  function handleAddUnit(u: StudyUnit) {
    addUnit(u.subject, u.topics)
  }

  function handleRemoveUnit(subject: string) {
    removeUnitBySubject(subject)
  }

  function setUserAvatarTouched(a: string) { setAvatarTouched(true); setUserAvatar(a) }

  // A student's pending "your WynkoHead published a schedule" notification: the
  // newest published schedule (in a community they're still in) they haven't
  // acted on or dismissed yet. WynkoHeads don't get it — they publish it.
  const scheduleNotif = (() => {
    const pending = communitySchedulesQ.data
      .filter(r => !r.is_admin && (!r.seen_published_at || new Date(r.published_at).getTime() > new Date(r.seen_published_at).getTime()))
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())[0]
    if (!pending) return null
    const p: PublishedSchedule = { week: normalizeWeek(pending.week), publishedAt: new Date(pending.published_at).getTime(), by: pending.published_by_name || 'Your WynkoHead' }
    return { id: pending.group_id, p, name: pending.name }
  })()
  function dismissScheduleNotif() {
    if (scheduleNotif) void decideSchedule(scheduleNotif.id, null) // "decide later": marks this version as seen
  }

  function renderPage() {
    if (activeNav === 'focus') {
      return <FocusLockPage units={sharedUnits} schedule={schedule} todayIdx={todayIdx} onNavigate={handleNav} profile={profile} autoStartTask={autoStartTask} onAutoStartHandled={() => setAutoStartTask(null)} />
    }
    // Quick Timer is intentionally separate from FocusLockPage - its own
    // page, own localStorage key, no shared state with Focus Lock at all.
    if (activeNav === 'quicktimer') {
      return <QuickTimerPage onNavigate={handleNav} />
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
      return <EarnPage onNavigate={handleNav} profile={profile} headStatus={headStatusQ.data} hasCommunity={!!headCommunity}
        onApply={applyWynkoHead} onCreateCommunity={createHeadCommunity} />
    }
    if (activeNav === 'settings') {
      return <SettingsPage onNavigate={handleNav} profile={profile} />
    }
    if (activeNav === 'studyrooms') {
      if (activeRoom) {
        return <RoomInteriorPage room={activeRoom} onBack={() => setActiveRoom(null)} onNavigate={handleNav} profile={profile} units={sharedUnits} schedule={schedule} todayIdx={todayIdx} backLabel={activeCommunity || headCommunity ? 'Community' : 'Rooms'} />
      }
      if (activeCommunity) {
        const live = communities.find(c => c.id === activeCommunity.id) ?? activeCommunity
        const row = scheduleRowFor(activeCommunity.id)
        return (
          <CommunityStudentPage key={activeCommunity.id} community={live}
            isHome={!!live.isHome}
            isOwner={live.myRole === 'admin'}
            week={row ? normalizeWeek(row.week) : null} weekBy={row?.published_by_name ?? null}
            onBack={() => setActiveCommunity(null)} onNavigate={handleNav}
            onJoinRoom={room => setActiveRoom(room)}
            onLeave={() => { void leaveCommunityById(activeCommunity.id) }}
            profile={profile}
            scheduleChoice={row?.choice ?? null}
            onAcceptSchedule={() => { void acceptCommunitySchedule(activeCommunity.id) }}
            onRejectSchedule={() => { void rejectCommunitySchedule(activeCommunity.id) }} />
        )
      }
      // A WynkoHead's Community is the management dashboard for the community
      // they run; "View Community" there opens the student view above.
      if (headCommunity) {
        {
          return (
            <WynkoHeadCommunityPage key={headCommunity.id} community={headCommunity} headName={profile?.displayName || headCommunity.headName || 'Your WynkoHead'} profile={profile}
              onNavigate={handleNav} onViewAsStudent={() => setActiveCommunity(headCommunity)} onEnterStudyRoom={room => setActiveRoom(room)}
              headSchedule={headSchedule} setHeadSchedule={setHeadSchedule} headUnits={headUnits} setHeadUnits={setHeadUnits}
              published={headPublished} onPublish={publishHeadSchedule} onCommunityChanged={refreshCommunities} />
          )
        }
      }
      return <StudyRoomsPage onNavigate={handleNav} onEnterRoom={room => setActiveRoom(room)} profile={profile}
        pendingJoinRoomId={pendingJoinRoomId} onPendingJoinHandled={() => setPendingJoinRoomId(null)}
        communityTab={studyRoomsTab} onCommunityTabChange={setStudyRoomsTab}
        onOpenCommunity={setActiveCommunity} communities={communities} communitiesStatus={myCommunitiesQ.status}
        communitiesError={myCommunitiesQ.error} onRefreshCommunities={refreshCommunities} />
    }

    // ── Home (the module wired to real data this pass) ──
    if (authState === 'loading' || (authState === 'ready' && (homeLoading || planStore.status === 'loading'))) {
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
    if (homeError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center px-6" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
          <div className="text-slate-200 text-base font-semibold">Couldn't load your dashboard</div>
          <div className="text-slate-500 text-sm max-w-xs">Check your connection and try again. Your study data is safe.</div>
          <button onClick={retryHome} className="mt-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ background: '#8b5cf6', color: '#fff' }}>Try again</button>
        </div>
      )
    }

    // Today's rows for the study-plan card below - real data only:
    // schedule[todayIdx] (today's actual scheduled sessions) merged with
    // the live Focus Lock plan, see buildTodayPlanRows.
    const todaySchedule = schedule[todayIdx] || []
    const todayPlanRows = buildTodayPlanRows(todaySchedule, focusPlan.tasks)

    // Focus Timer's "completed today" count: pomodoro tasks in the live plan
    return (
      <div className="flex h-screen overflow-hidden text-slate-200" style={{ background: '#080A12', fontFamily: 'Poppins, sans-serif' }}>
        <Sidebar active={activeNav} setActive={handleNav} profile={profile} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header profile={profile} />
          <main className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
            <StudyProgress weeklyStudy={weeklyStudy} totalMinutes={totalWeekMinutes} avgMinutes={avgWeekMinutes} streakDays={todayFocus.streakDays} />
            {/* Today's Study Plan | Focus Timer (primary) | Quick Timer (secondary, ~half the width of Focus Timer) */}
            <div className="grid grid-cols-1 lg:grid-cols-[6fr_6fr_3fr] gap-3.5 items-stretch">
              <TodayStudyPlanCard
                rows={todayPlanRows}
                onStartTask={(subject, topic) => goFocus({ subject, topic })}
                onAddTask={() => setShowHomeAddTask(true)}
              />
              <HomeFocusTimerCard
                pomo={homePomo}
                onGoFocus={() => goFocus()}
              />
              <HomeQuickTimerCard onOpenQuickTimer={() => handleNav('quicktimer')} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3.5 items-stretch">
              <LiveStudyRoomsCard onEnterRoom={openRoom} onViewAll={viewAllRooms} />
              <MotivationalCard onKeepGoing={() => goFocus()} />
            </div>
            <div className="h-4" />
          </main>
        </div>
        {showHomeAddTask && <AddTaskModal onClose={() => setShowHomeAddTask(false)} onAdd={handleHomeAddTask} />}
      </div>
    )
  }

  return (
    <UserAvatarCtx.Provider value={{ avatar: userAvatar, setAvatar: setUserAvatarTouched }}>
      {renderPage()}
      {scheduleNotif && authState === 'ready' && (
        <ScheduleNotificationCard communityName={scheduleNotif.name} published={scheduleNotif.p}
          onAccept={() => { void acceptCommunitySchedule(scheduleNotif.id) }}
          onCreateOwn={() => { void rejectCommunitySchedule(scheduleNotif.id); handleNav('schedules') }}
          onDismiss={dismissScheduleNotif} />
      )}
      {communityNotice && (
        <div role="status" className="fixed bottom-5 right-5 z-[80] max-w-[360px] rounded-xl border px-4 py-3 flex items-start gap-3 text-[13px] text-slate-200"
          style={{ background: '#0B1530', borderColor: '#2855CC', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          <span className="flex-1">{communityNotice}</span>
          <button onClick={() => setCommunityNotice(null)} aria-label="Dismiss" className="text-slate-500 hover:text-slate-200"><Ico n="close" cls="w-4 h-4" /></button>
        </div>
      )}
    </UserAvatarCtx.Provider>
  )
}


