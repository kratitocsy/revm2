// localStorage-backed state shared between the WynkoHead's management view and
// the student's view of the same community.
//
// There is no backend for communities yet, so this is what lets the two sides
// of one flow talk to each other in a single browser: a schedule the WynkoHead
// publishes reaches the student as a notification, and announcements a
// WynkoHead posts show up in the student's feed. Replace these functions with
// real API calls when the community tables exist; nothing in the UI reads
// localStorage directly.
import { Store } from '../../../lib/storage'
import type { CommunityAnnouncement } from './communityData'

// Same shape as the dashboard's ScheduleItem, redeclared so this file has no
// import cycle with DesktopDashboard.tsx.
export interface PublishedSession {
  id: string; subject: string; topic: string
  startTime: string; endTime: string; color: string; iconEmoji: string
}

export interface PublishedSchedule {
  week: PublishedSession[][] // Mon → Sun
  publishedAt: number // epoch ms
  by: string // WynkoHead's display name
}

export const STORE_KEYS = {
  published: 'wynko_published_schedules_v1', // { [communityId]: PublishedSchedule }
  seen: 'wynko_schedule_notif_seen_v1', // { [communityId]: publishedAt the student last acted on }
  announcements: 'wynko_community_announcements_v1', // { [communityId]: CommunityAnnouncement[] }
  headDraft: 'wynko_head_schedule_v1', // the WynkoHead's in-progress schedule
} as const

export function loadPublishedSchedules(): Record<number, PublishedSchedule> {
  return (Store.get(STORE_KEYS.published, null) as Record<number, PublishedSchedule> | null) ?? {}
}

export function savePublishedSchedule(communityId: number, p: PublishedSchedule): Record<number, PublishedSchedule> {
  const next = { ...loadPublishedSchedules(), [communityId]: p }
  Store.set(STORE_KEYS.published, next)
  return next
}

export function loadNotifSeen(): Record<number, number> {
  return (Store.get(STORE_KEYS.seen, null) as Record<number, number> | null) ?? {}
}

export function markNotifSeen(communityId: number, publishedAt: number): Record<number, number> {
  const next = { ...loadNotifSeen(), [communityId]: publishedAt }
  Store.set(STORE_KEYS.seen, next)
  return next
}

// Announcements: the stored list (if the WynkoHead has ever edited it) wins;
// until then everyone sees the seed list from communityData.
export function loadAnnouncements(communityId: number, seed: CommunityAnnouncement[]): CommunityAnnouncement[] {
  const all = (Store.get(STORE_KEYS.announcements, null) as Record<number, CommunityAnnouncement[]> | null) ?? {}
  return all[communityId] ?? seed
}

export function saveAnnouncements(communityId: number, list: CommunityAnnouncement[]) {
  const all = (Store.get(STORE_KEYS.announcements, null) as Record<number, CommunityAnnouncement[]> | null) ?? {}
  Store.set(STORE_KEYS.announcements, { ...all, [communityId]: list })
}

export function loadHeadDraft(): PublishedSession[][] | null {
  const d = Store.get(STORE_KEYS.headDraft, null) as PublishedSession[][] | null
  return Array.isArray(d) && d.length === 7 ? d : null
}

export function saveHeadDraft(week: PublishedSession[][]) {
  Store.set(STORE_KEYS.headDraft, week)
}
