import { useCallback, useEffect, useRef, useState } from 'react';
import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Communities data (desktop dashboard "Community" module).

   A community is a study_groups row with is_revhead_group = true,
   owned by a verified WynkoHead (user_profiles.is_revhead +
   revhead_status = 'verified' - the pre-rename "RevHead" columns).
   Everything here goes through migration 0071's functions/tables;
   access control is server-side (RLS + security-definer checks).
   ============================================================ */

export type CommunityJoinStatus = 'joined' | 'requested' | 'already_member' | 'full' | 'invalid';
export type ScheduleChoice = 'accepted' | 'rejected';
export type WynkoHeadApplication = 'none' | 'pending' | 'verified' | 'rejected';

export interface MyCommunity {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  member_count: number;
  live_count: number;
  my_role: 'admin' | 'member';
  is_home: boolean | null;
  home_locked_until: string | null;
  head_name: string;
  join_requires_approval: boolean;
  invite_token: string | null; // only for the community's admin
  preview_initials: string[] | null;
  joined_at: string;
}

export interface DiscoverCommunity {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  member_count: number;
  head_name: string;
  join_requires_approval: boolean;
  requested: boolean;
}

export interface CommunityDetailData {
  head: { name: string; avatar_url: string | null };
  member_count: number;
  studying_now: number;
  my: {
    today_minutes: number;
    today_sessions: number;
    total_minutes: number;
    total_sessions: number;
    weekly_minutes: number[]; // last 7 days, oldest → today
    adherence: number | null;
  };
  stats: { avg_daily_minutes: number; active_subjects: number; avg_adherence: number | null };
}

export interface CommunityAnnouncementRow {
  id: string;
  group_id: string;
  title: string;
  message: string;
  pinned: boolean;
  important: boolean;
  created_at: string;
}

export interface CommunityScheduleRow {
  group_id: string;
  name: string;
  week: unknown[][];
  published_at: string;
  published_by_name: string | null;
  choice: ScheduleChoice | null;
  seen_published_at: string | null;
  is_admin: boolean;
}

export interface HeadOverviewData {
  members: number;
  active_today: number;
  avg_daily_minutes: number;
  avg_adherence: number | null;
  studying_now: number;
  current_subject: string | null;
}

export interface StudentAnalyticsRow {
  user_id: string;
  name: string;
  avatar_url: string | null;
  study_minutes: number;
  sessions: number;
  streak_days: number;
  revision: number;
  tasks: number;
  last_active_at: string | null;
  adherence: number | null;
}

export interface JoinRequestRow {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  created_at: string;
}

export interface WynkoHeadStatus {
  application: WynkoHeadApplication;
  verified: boolean;
  upiId: string | null;
}

export interface EarningsLedgerRow { amount: number; source: string | null; occurred_at: string }
export interface PayoutRow { request_id: string; amount: number; status: string; requested_at: string; processed_at: string | null; payment_reference: string | null }

function messageOf(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a bit and try again.';
  return m;
}
// Awaits a Supabase query/RPC and returns its data, throwing a readable Error
// on failure. The row shape is declared by the caller (the SQL functions in
// migration 0071 define it; there are no generated DB types in this repo).
async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>, fallback: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(messageOf(error, fallback));
  return data as T;
}

// ── Student side ─────────────────────────────────────────────────────────────
export const fetchMyCommunities = () => call<MyCommunity[]>(sb.rpc('my_communities'), 'Could not load your communities').then((d) => d ?? []);
export const fetchDiscoverCommunities = () => call<DiscoverCommunity[]>(sb.rpc('discover_communities'), 'Could not load communities').then((d) => d ?? []);

/** Which of these communities are in the monetisation program (shown with the verified tick). Migration 0074. */
export async function fetchMonetizedCommunityIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await call<{ id: string; monetization_enabled: boolean }[]>(
    sb.from('study_groups').select('id, monetization_enabled').in('id', ids),
    'Could not load community status',
  );
  return new Set((rows ?? []).filter((r) => r.monetization_enabled).map((r) => r.id));
}
/**
 * The caller's Home Community (community_home, own row via RLS). `chosen` is
 * false when it was assigned automatically because they're in exactly one
 * community; with two or more they must pick one explicitly (migration 0078).
 */
export async function fetchMyHomeCommunity(): Promise<{ group_id: string; chosen: boolean; locked_until: string } | null> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  return call(
    sb.from('community_home').select('group_id, chosen, locked_until').eq('user_id', auth.user.id).maybeSingle(),
    'Could not load your Home Community',
  );
}
/** Owner only; turning it on requires an approved WynkoHead (checked server-side). */
export const setCommunityMonetization = (groupId: string, enabled: boolean) =>
  call<boolean>(sb.rpc('rpc_set_community_monetization', { p_group_id: groupId, p_enabled: enabled }), 'Could not update monetisation');
/** A monetised community's new owner becomes a WynkoHead while they own it (migration 0075). */
export const transferCommunityOwnership = (groupId: string, newOwnerId: string) =>
  call(sb.rpc('rpc_transfer_community_ownership', { p_group_id: groupId, p_new_owner: newOwnerId }), 'Could not transfer the community');

/** Pulls the token out of a pasted invite link (…?community=<token>) or takes a bare code. */
export function parseInviteInput(input: string): string {
  const s = input.trim();
  try {
    const u = new URL(s);
    return u.searchParams.get('community') || u.searchParams.get('invite') || s;
  } catch {
    return s;
  }
}

export async function joinCommunity(opts: { groupId?: string; token?: string; note?: string }): Promise<{ status: CommunityJoinStatus; groupId: string | null }> {
  const rows = await call<{ status: CommunityJoinStatus; group_id: string | null }[]>(
    sb.rpc('rpc_join_community', { p_group_id: opts.groupId ?? null, p_token: opts.token ?? null, p_note: opts.note ?? null }),
    'Could not join the community',
  );
  const r = rows?.[0];
  return { status: r?.status ?? 'invalid', groupId: r?.group_id ?? null };
}

export const leaveCommunity = (groupId: string) => call(sb.rpc('rpc_leave_community', { p_group_id: groupId }), 'Could not leave the community');
export const setHomeCommunity = (groupId: string) =>
  call<string>(sb.rpc('rpc_set_home_community', { p_group_id: groupId }), 'Could not change your Home Community');
export const fetchCommunityDetail = (groupId: string) =>
  call<CommunityDetailData>(sb.rpc('community_detail', { p_group_id: groupId }), 'Could not load this community');

export async function fetchAnnouncements(groupId: string): Promise<CommunityAnnouncementRow[]> {
  return call<CommunityAnnouncementRow[]>(
    sb.from('community_announcements').select('id, group_id, title, message, pinned, important, created_at')
      .eq('group_id', groupId).order('created_at', { ascending: false }).limit(100),
    'Could not load announcements',
  ).then((d) => d ?? []);
}

export const fetchMyCommunitySchedules = () =>
  call<CommunityScheduleRow[]>(sb.rpc('my_community_schedules'), 'Could not load community schedules').then((d) => d ?? []);
/** 'accepted' | 'rejected', or null to just mark the current version as seen ("decide later"). */
export const setScheduleChoice = (groupId: string, choice: ScheduleChoice | null) =>
  call(sb.rpc('rpc_set_schedule_choice', { p_group_id: groupId, p_choice: choice }), 'Could not save your choice');

// ── WynkoHead side ───────────────────────────────────────────────────────────
export async function fetchWynkoHeadStatus(userId: string): Promise<WynkoHeadStatus> {
  const d = await call<{ is_revhead: boolean | null; revhead_status: string | null; upi_id: string | null } | null>(
    sb.from('user_profiles').select('is_revhead, revhead_status, upi_id').eq('id', userId).maybeSingle(),
    'Could not load your WynkoHead status',
  );
  const application = (['none', 'pending', 'verified', 'rejected'].includes(d?.revhead_status ?? '') ? d?.revhead_status : 'none') as WynkoHeadApplication;
  return { application, verified: !!d?.is_revhead && application === 'verified', upiId: d?.upi_id ?? null };
}

/** The signed-in user's WynkoHead status (null when signed out). */
export async function fetchMyWynkoHeadStatus(): Promise<WynkoHeadStatus | null> {
  const { data } = await sb.auth.getSession();
  return data.session ? fetchWynkoHeadStatus(data.session.user.id) : null;
}

/** Submits a WynkoHead application (reviewed by an admin via admin_verify_revhead). */
export const applyAsWynkoHead = (referralCode?: string) =>
  call(sb.rpc('revhead_apply', { p_referral_code: referralCode?.trim() || null }), 'Could not submit your application');

export const createCommunity = (name: string, description: string, emoji?: string) =>
  call<string>(sb.rpc('rpc_create_community', { p_name: name, p_description: description || null, p_emoji: emoji ?? null }), 'Could not create your community');

export const fetchHeadOverview = (groupId: string) =>
  call<HeadOverviewData>(sb.rpc('community_head_overview', { p_group_id: groupId }), 'Could not load your community overview');
export const fetchStudentAnalytics = (groupId: string) =>
  call<StudentAnalyticsRow[]>(sb.rpc('community_student_analytics', { p_group_id: groupId }), 'Could not load student analytics').then((d) => d ?? []);
export const fetchJoinRequests = (groupId: string) =>
  call<JoinRequestRow[]>(sb.rpc('community_join_request_list', { p_group_id: groupId }), 'Could not load join requests').then((d) => d ?? []);
export const decideJoinRequest = (requestId: string, approve: boolean) =>
  call<string>(sb.rpc('rpc_decide_join_request', { p_request_id: requestId, p_approve: approve }), 'Could not update that request');

export async function updateCommunitySettings(groupId: string, patch: { name?: string; description?: string; join_requires_approval?: boolean }) {
  const { error } = await sb.from('study_groups').update(patch).eq('id', groupId);
  if (error) throw new Error(messageOf(error, 'Could not save community settings'));
}

export async function postAnnouncement(groupId: string, a: { title: string; message: string; pinned: boolean; important: boolean }) {
  const { error } = await sb.from('community_announcements').insert({ group_id: groupId, ...a });
  if (error) throw new Error(messageOf(error, 'Could not post the announcement'));
}
export async function deleteAnnouncement(id: string) {
  const { error } = await sb.from('community_announcements').delete().eq('id', id);
  if (error) throw new Error(messageOf(error, 'Could not delete the announcement'));
}

export const publishCommunitySchedule = (groupId: string, week: unknown[][]) =>
  call<string>(sb.rpc('rpc_publish_community_schedule', { p_group_id: groupId, p_week: week }), 'Could not publish the schedule');

export async function loadScheduleDraft(groupId: string): Promise<{ week: unknown[][]; units: unknown[] } | null> {
  const d = await call<{ week: unknown[][]; units: unknown[] } | null>(
    sb.from('community_schedule_drafts').select('week, units').eq('group_id', groupId).maybeSingle(),
    'Could not load your schedule draft',
  );
  return d ?? null;
}
export async function saveScheduleDraft(groupId: string, week: unknown[][], units: unknown[]) {
  const { error } = await sb.from('community_schedule_drafts')
    .upsert({ group_id: groupId, week, units, updated_at: new Date().toISOString() }, { onConflict: 'group_id' });
  if (error) throw new Error(messageOf(error, 'Could not save your schedule draft'));
}

/** Link that opens the dashboard and sends a join request / joins this community. */
export function communityInviteLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/home.html?community=${encodeURIComponent(token)}`;
}

// ── Earnings (existing RevHead ledger / payout backend) ──────────────────────
export async function fetchEarningsLedger(days: number): Promise<EarningsLedgerRow[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  return call<EarningsLedgerRow[]>(
    sb.from('revhead_earnings_ledger').select('amount, source, occurred_at').gte('occurred_at', since).order('occurred_at'),
    'Could not load earnings',
  ).then((d) => (d ?? []).map((r) => ({ ...r, amount: Number(r.amount) || 0 })));
}
export const fetchEarningsSummary = (days: number) =>
  call<{ own_earnings: number; referral_earnings: number }[]>(sb.rpc('my_revhead_earnings_summary', { p_days: days }), 'Could not load earnings')
    .then((d) => ({ own: Number(d?.[0]?.own_earnings) || 0, referral: Number(d?.[0]?.referral_earnings) || 0 }));
export const fetchPayoutHistory = () =>
  call<PayoutRow[]>(sb.rpc('my_payout_history'), 'Could not load payouts').then((d) => (d ?? []).map((p) => ({ ...p, amount: Number(p.amount) || 0 })));
export const fetchWalletBalance = () => call<number>(sb.rpc('my_wallet_balance'), 'Could not load your balance').then((n) => Number(n) || 0);
export const requestPayout = () => call(sb.rpc('request_payout'), 'Could not request a payout');

// Payouts need a wallet balance of at least this much (migration 0080).
export const MIN_PAYOUT_INR = 500;

// Monetisation is 18+ only; the date of birth can be set once (migration 0080).
export const setMyDateOfBirth = (dob: string) =>
  call(sb.rpc('set_my_date_of_birth', { p_dob: dob }), 'Could not save your date of birth');

// ── Referrals (migration 0079) ──────────────────────────────────────────────
// Anyone can refer. When someone who signed up through your link creates a
// community and it gets monetised, you earn 10% of the platform's 50% share
// of that community's revenue for 6 months from its first monetisation.
export interface ReferralSummary {
  referral_code: string | null;
  people_referred: number;
  communities_created: number;
  communities_earning: number;
  total_earned: number;
  wallet_balance: number;
  upi_id: string | null;
}
export async function fetchReferralSummary(): Promise<ReferralSummary> {
  await call<string>(sb.rpc('my_referral_code'), 'Could not create your referral code');
  const rows = await call<ReferralSummary[]>(sb.rpc('my_referral_summary'), 'Could not load your referrals');
  const r = rows?.[0];
  return {
    referral_code: r?.referral_code ?? null,
    people_referred: r?.people_referred ?? 0,
    communities_created: r?.communities_created ?? 0,
    communities_earning: r?.communities_earning ?? 0,
    total_earned: Number(r?.total_earned) || 0,
    wallet_balance: Number(r?.wallet_balance) || 0,
    upi_id: r?.upi_id ?? null,
  };
}
export const referralLink = (code: string) => `${window.location.origin}/login?ref=${encodeURIComponent(code)}`;
export const setMyUpiId = (upi: string) => call(sb.rpc('set_my_upi_id', { p_upi_id: upi }), 'Could not save your UPI ID');

// ── Hooks ────────────────────────────────────────────────────────────────────
/** Generic "load, keep last good value, refresh on focus/interval" helper. */
export function useLoader<T>(load: (() => Promise<T>) | null, initial: T, deps: unknown[], intervalMs = 60_000) {
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(load ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    const fn = loadRef.current;
    if (!fn) return;
    try {
      const next = await fn();
      setData(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    if (!loadRef.current) { setStatus('ready'); return; }
    setStatus('loading');
    void refresh();
    const id = intervalMs > 0 ? setInterval(() => void refresh(), intervalMs) : null;
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { if (id) clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, status, error, refresh, setData };
}

/** Re-runs `onChange` when rows of `table` change (debounced). `filter` is a
 *  realtime filter like `group_id=eq.<id>`, or '' for every row RLS lets the
 *  user see; null (or enabled = false) turns the subscription off. */
export function useRealtimeRefresh(table: string, filter: string | null, onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (filter === null || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const opts: { event: '*'; schema: string; table: string; filter?: string } = { event: '*', schema: 'public', table };
    if (filter) opts.filter = filter;
    const channel = sb
      .channel(`${table}-${filter || 'all'}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', opts, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => cb.current(), 300);
      })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void sb.removeChannel(channel); };
  }, [table, filter, enabled]);
}
