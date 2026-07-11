import type { CombatStats } from '../game/stats';
import type { Match } from '../game/match';
import type { Json } from './database.types';
import { ensureGuestSession } from './auth';
import { getSupabase } from './supabase';

export type PlayerStatsRow = {
  user_id: string;
  matches_played: number;
  wins: number;
  losses: number;
  total_kos: number;
  total_deaths: number;
  total_damage_dealt: number;
  total_damage_taken: number;
  total_blocks: number;
  total_distance_m: number;
  best_placement: number;
  updated_at: string;
};

export type MatchHistoryRow = {
  id: string;
  user_id: string;
  mode: string;
  placement: number;
  rounds_won: number;
  opponents: number;
  duration_sec: number;
  room_code: string | null;
  stats: Json;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
  updated_at: string;
};

export interface AccountSummary {
  profile: ProfileRow | null;
  stats: PlayerStatsRow | null;
  recentMatches: MatchHistoryRow[];
  isGuest: boolean;
}

/** Load profile, lifetime stats, and recent matches for the account screen. */
export async function loadAccountSummary(): Promise<AccountSummary | null> {
  const sb = getSupabase();
  const uid = await ensureGuestSession();
  if (!sb || !uid) return null;

  const [profileRes, statsRes, historyRes, userRes] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('player_stats').select('*').eq('user_id', uid).maybeSingle(),
    sb
      .from('match_history')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(10),
    sb.auth.getUser(),
  ]);

  const isGuest = userRes.data.user?.is_anonymous ?? true;

  return {
    profile: profileRes.data as ProfileRow | null,
    stats: statsRes.data as PlayerStatsRow | null,
    recentMatches: (historyRes.data ?? []) as MatchHistoryRow[],
    isGuest,
  };
}

/** Record online match result with room code. */
export async function persistOnlineMatch(
  match: Match,
  stats: CombatStats,
  roomCode: string,
  placement: number,
): Promise<void> {
  const sb = getSupabase();
  const uid = await ensureGuestSession();
  if (!sb || !uid) return;

  const won = placement === 1;

  await sb.from('match_history').insert({
    user_id: uid,
    mode: 'online',
    placement,
    rounds_won: match.player.roundWins,
    opponents: match.fighters.length - 1,
    duration_sec: 0,
    room_code: roomCode,
    stats: stats as unknown as Json,
  });

  const { data: row } = await sb.from('player_stats').select('*').eq('user_id', uid).maybeSingle();
  const prev = (row as PlayerStatsRow | null) ?? {
    matches_played: 0,
    wins: 0,
    losses: 0,
    total_kos: 0,
    total_deaths: 0,
    total_damage_dealt: 0,
    total_damage_taken: 0,
    total_blocks: 0,
    total_distance_m: 0,
    best_placement: 4,
    user_id: uid,
    updated_at: new Date().toISOString(),
  };

  await sb.from('player_stats').upsert({
    user_id: uid,
    matches_played: prev.matches_played + 1,
    wins: prev.wins + (won ? 1 : 0),
    losses: prev.losses + (won ? 0 : 1),
    total_kos: prev.total_kos + stats.kos,
    total_deaths: prev.total_deaths + stats.deaths,
    total_damage_dealt: prev.total_damage_dealt + stats.damageDealt,
    total_damage_taken: prev.total_damage_taken + stats.damageTaken,
    total_blocks: prev.total_blocks + stats.blocks,
    total_distance_m: prev.total_distance_m + stats.distanceM,
    best_placement: Math.min(prev.best_placement, placement),
    updated_at: new Date().toISOString(),
  });
}
