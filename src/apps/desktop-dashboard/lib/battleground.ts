import { sb } from '../../_shared/supabaseClient';

/* ============================================================
   Battleground data: 1v1 focus duels (migration 0062, opponent
   search added in 0072). Everything here goes through
   security-definer RPCs - challenge/accept/ready/pause are all
   validated server-side, nothing here is trusted for scoring.

   get_battleground_state() is the one-round-trip hub snapshot
   (my XP/title, my active battle if any, my outgoing invite, my
   incoming invites, my lifetime stats). The page re-fetches it on
   a realtime change to `battles` or `battle_invitations` (RLS
   already scopes those tables to rows the caller is part of, so no
   extra filter is needed on the subscription).
   ============================================================ */

function messageOf(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a bit and try again.';
  return m;
}
async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>, fallback: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(messageOf(error, fallback));
  return data as T;
}

export interface BattleMe { xp: number; title: string }
export interface ActiveBattle {
  id: string;
  status: 'pending' | 'active';
  started_at: string | null;
  opponent_id: string;
  opponent_username: string;
  opponent_avatar: string | null;
  i_am_ready: boolean;
  opponent_ready: boolean;
}
export interface OutgoingInvite {
  id: string;
  to_user: string;
  created_at: string;
  expires_at: string;
  username: string;
  avatar_url: string | null;
}
export interface IncomingInvite {
  id: string;
  from_user: string;
  created_at: string;
  expires_at: string;
  username: string;
  avatar_url: string | null;
  title: string;
}
export interface BattleStats { total: number; wins: number; losses: number; total_focus_seconds: number }
export interface BattlegroundState {
  me: BattleMe;
  active: ActiveBattle | null;
  outgoing_invite: OutgoingInvite | null;
  incoming_invites: IncomingInvite[];
  stats: BattleStats;
}

export interface BattleOpponent { id: string; username: string; avatar_url: string | null; battle_xp: number; title: string }

export interface BattleHistoryRow {
  id: string;
  ended_at: string;
  opponent_id: string;
  opponent_username: string;
  opponent_avatar: string | null;
  result: 'won' | 'lost';
  focus_seconds: number;
  xp_earned: number;
}

// Raw `battles` row shape, as returned by ready_battle()/pause_battle().
export interface BattleRow {
  id: string;
  player_a: string;
  player_b: string;
  status: 'pending' | 'active' | 'finished' | 'cancelled';
  a_ready: boolean;
  b_ready: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  winner_id: string | null;
  loser_id: string | null;
  paused_by: string | null;
  winner_xp_awarded: number;
  loser_xp_awarded: number;
}

export const fetchBattlegroundState = () =>
  call<BattlegroundState>(sb.rpc('get_battleground_state'), 'Could not load Battleground');

export const searchBattleOpponents = (query: string, limit = 20) =>
  call<BattleOpponent[]>(sb.rpc('search_battle_opponents', { p_query: query, p_limit: limit }), 'Could not search for opponents')
    .then((d) => d ?? []);

export const fetchTopBattlers = (limit = 10) =>
  call<BattleOpponent[]>(sb.rpc('get_top_battlers', { p_limit: limit }), 'Could not load the leaderboard').then((d) => d ?? []);

export const fetchBattleHistory = (limit = 100) =>
  call<BattleHistoryRow[]>(sb.rpc('get_battle_history', { p_limit: limit }), 'Could not load battle history').then((d) => d ?? []);

export const sendBattleChallenge = (toUserId: string) =>
  call(sb.rpc('send_battle_challenge', { p_to_user: toUserId }), 'Could not send that challenge');

export const cancelBattleChallenge = (invitationId: string) =>
  call(sb.rpc('cancel_battle_challenge', { p_invitation_id: invitationId }), 'Could not cancel the challenge');

export const respondBattleChallenge = (invitationId: string, accept: boolean) =>
  call<{ accepted: boolean; battle_id?: string }>(
    sb.rpc('respond_battle_challenge', { p_invitation_id: invitationId, p_accept: accept }),
    'Could not respond to that challenge',
  );

export const readyBattle = (battleId: string) =>
  call<BattleRow>(sb.rpc('ready_battle', { p_battle_id: battleId }), 'Could not mark you ready');

export const cancelPendingBattle = (battleId: string) =>
  call(sb.rpc('cancel_pending_battle', { p_battle_id: battleId }), 'Could not cancel the battle');

export const pauseBattle = (battleId: string) =>
  call<BattleRow>(sb.rpc('pause_battle', { p_battle_id: battleId }), 'Could not update the battle');
