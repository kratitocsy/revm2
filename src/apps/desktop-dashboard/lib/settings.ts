import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Settings page data. Profile fields live on user_profiles (own row,
   RLS: auth.uid() = id); username goes through set_my_username() for
   its format/uniqueness checks; email, password and linked sign-in
   providers are Supabase Auth, not table columns. Migration 0073 added
   bio/school/class_year/course/allow_battle_invites/preferences and the
   trigger that stops clients writing privileged columns directly.
   ============================================================ */

export type LinkableProvider = 'google' | 'discord';

export interface SettingsPreferences {
  avatar_preset: number | null; // index into the 6 bundled avatars; null = use real photo
  notif_focus_alerts: boolean;
  notif_streak: boolean;
  notif_battle: boolean;
  notif_rooms: boolean;
  notif_achievements: boolean;
  sound_effects: boolean;
  privacy_public_profile: boolean;
  privacy_show_streak: boolean;
  privacy_show_stats: boolean;
  privacy_allow_room_invites: boolean;
  focus_auto_start_breaks: boolean;
  focus_block_distractions: boolean;
  focus_ambient_sound: boolean;
}

export const DEFAULT_PREFERENCES: SettingsPreferences = {
  avatar_preset: null,
  notif_focus_alerts: true,
  notif_streak: true,
  notif_battle: true,
  notif_rooms: true,
  notif_achievements: true,
  sound_effects: true,
  privacy_public_profile: true,
  privacy_show_streak: true,
  privacy_show_stats: true,
  privacy_allow_room_invites: true,
  focus_auto_start_breaks: false,
  focus_block_distractions: true,
  focus_ambient_sound: false,
};

export function normalizePreferences(raw: unknown): SettingsPreferences {
  const out = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_PREFERENCES) as (keyof SettingsPreferences)[]) {
    if (k === 'avatar_preset') {
      const v = r[k];
      out.avatar_preset = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 6 ? v : null;
    } else if (typeof r[k] === 'boolean') {
      (out[k] as boolean) = r[k] as boolean;
    }
  }
  return out;
}

export interface SettingsProfile {
  userId: string;
  email: string;
  displayName: string;
  username: string;
  bio: string;
  school: string;
  classYear: string;
  course: string;
  exam: string;
  dailyGoalMinutes: number;
  remindersEnabled: boolean;
  allowBattleInvites: boolean;
  avatarUrl: string | null;
  preferences: SettingsPreferences;
}

export interface LinkedIdentity { provider: string; identityId: string; email: string | null; raw: unknown }

function messageOf(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a bit and try again.';
  if (/manual linking/i.test(m)) return 'Account linking is turned off for this app. Enable "Manual linking" in Supabase Auth settings.';
  if (/provider is not enabled/i.test(m)) return 'That sign-in provider isn’t enabled in Supabase Auth yet.';
  return m;
}

async function requireUser() {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error('You’re signed out. Sign in again to change settings.');
  return data.user;
}

export async function loadSettings(): Promise<SettingsProfile> {
  const user = await requireUser();
  const { data, error } = await sb.from('user_profiles')
    .select('display_name, full_name, username, bio, school, class_year, course, exam, daily_focus_goal_minutes, reminders_enabled, allow_battle_invites, avatar_url, preferences')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(messageOf(error, 'Could not load your settings'));
  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: data?.display_name ?? data?.full_name ?? '',
    username: data?.username ?? '',
    bio: data?.bio ?? '',
    school: data?.school ?? '',
    classYear: data?.class_year ?? '',
    course: data?.course ?? '',
    exam: data?.exam ?? '',
    dailyGoalMinutes: data?.daily_focus_goal_minutes ?? 180,
    remindersEnabled: data?.reminders_enabled ?? true,
    allowBattleInvites: data?.allow_battle_invites ?? true,
    avatarUrl: data?.avatar_url ?? null,
    preferences: normalizePreferences(data?.preferences),
  };
}

export interface ProfilePatch {
  display_name?: string | null;
  bio?: string | null;
  school?: string | null;
  class_year?: string | null;
  course?: string | null;
  exam?: string | null;
  daily_focus_goal_minutes?: number;
  reminders_enabled?: boolean;
  allow_battle_invites?: boolean;
  preferences?: SettingsPreferences;
}

export async function saveProfileFields(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await sb.from('user_profiles').update(patch).eq('id', userId);
  if (error) throw new Error(messageOf(error, 'Could not save your changes'));
}

export async function saveUsername(username: string): Promise<string> {
  const { data, error } = await sb.rpc('set_my_username', { p_username: username });
  if (error) throw new Error(messageOf(error, 'Could not change your username'));
  return data as string;
}

export async function changeEmail(email: string): Promise<void> {
  const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: window.location.href });
  if (error) throw new Error(messageOf(error, 'Could not change your email'));
}

export async function listIdentities(): Promise<LinkedIdentity[]> {
  const { data, error } = await sb.auth.getUserIdentities();
  if (error) throw new Error(messageOf(error, 'Could not load connected accounts'));
  return (data?.identities ?? []).map((i) => ({
    provider: i.provider,
    identityId: i.identity_id,
    email: (i.identity_data?.email as string | undefined) ?? null,
    raw: i,
  }));
}

/** An email/password login exists only if the user has an `email` identity. */
export const hasPasswordLogin = (ids: LinkedIdentity[]) => ids.some((i) => i.provider === 'email');

export async function changePassword(email: string, current: string | null, next: string): Promise<void> {
  if (current !== null) {
    // Re-verify before changing, so an unattended signed-in browser can't be used to take over the login.
    const { error: verifyErr } = await sb.auth.signInWithPassword({ email, password: current });
    if (verifyErr) throw new Error('Your current password is incorrect.');
  }
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) throw new Error(messageOf(error, 'Could not change your password'));
}

export async function linkProvider(provider: LinkableProvider): Promise<void> {
  const { error } = await sb.auth.linkIdentity({ provider, options: { redirectTo: window.location.href } });
  if (error) throw new Error(messageOf(error, 'Could not connect that account'));
}

export async function unlinkProvider(identity: LinkedIdentity): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await sb.auth.unlinkIdentity(identity.raw as any);
  if (error) throw new Error(messageOf(error, 'Could not disconnect that account'));
}

/** Everything the user's own RLS lets them read, bundled as one JSON download. */
export async function exportMyData(userId: string): Promise<Blob> {
  const [profile, sessions, plan, tasks, battles] = await Promise.all([
    sb.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
    sb.from('study_sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
    sb.from('study_plans').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('study_plan_tasks').select('*').eq('user_id', userId),
    sb.rpc('get_battle_history', { p_limit: 100 }),
  ]);
  const failed = [profile, sessions, plan, tasks, battles].find((r) => r.error);
  if (failed?.error) throw new Error(messageOf(failed.error, 'Could not export your data'));
  const payload = {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    study_sessions: sessions.data,
    study_plan: plan.data,
    study_plan_tasks: tasks.data,
    battle_history: battles.data,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await sb.rpc('delete_my_account', { p_confirm: 'DELETE' });
  if (error) throw new Error(messageOf(error, 'Could not delete your account'));
  await sb.auth.signOut();
}

/**
 * Same rule as the site-wide signOutRevM2(): signing out is blocked while a
 * Focus Lock block is genuinely active, otherwise "sign out, do whatever,
 * sign back in" would bypass every block. Returns an error message if blocked.
 */
export async function signOut(): Promise<string | null> {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      try {
        const { data: active } = await sb.from('focus_lock_sessions')
          .select('ends_at, unlimited, paused_until')
          .eq('user_id', session.user.id).eq('active', true).maybeSingle();
        const genuinelyActive = active && !(active.paused_until && new Date(active.paused_until) > new Date());
        if (genuinelyActive) {
          const until = !active.unlimited && active.ends_at
            ? ` (ends ${new Date(active.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : '';
          return `You have an active focus block right now${until} — signing out is disabled while it’s running.`;
        }
      } catch { /* couldn't verify - don't trap someone with no active block */ }
      await sb.auth.signOut();
    }
  } catch { /* still redirect */ }
  window.location.href = '/login.html';
  return null;
}
