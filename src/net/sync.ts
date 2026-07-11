import type { Match } from '../game/match';
import type { CombatStats } from '../game/stats';
import { loadSettings, saveSettings, type AIDifficulty, type GameSettings } from '../game/settings';
import type { Json } from './database.types';
import { ensureGuestSession } from './auth';
import { getSupabase } from './supabase';

function isDifficulty(v: string): v is AIDifficulty {
  return v === 'easy' || v === 'normal' || v === 'hard';
}

/** Pull cloud settings into localStorage after guest sign-in. */
export async function pullCloudSettings(): Promise<void> {
  const sb = getSupabase();
  const uid = await ensureGuestSession();
  if (!sb || !uid) return;

  const { data, error } = await sb
    .from('user_settings')
    .select('master_volume, sfx_volume, screen_shake, ai_difficulty')
    .eq('user_id', uid)
    .maybeSingle();

  const { data: profile } = await sb
    .from('profiles')
    .select('display_name')
    .eq('id', uid)
    .maybeSingle();

  if (error || !data) {
    if (profile?.display_name) {
      const local = loadSettings();
      saveSettings({ ...local, displayName: profile.display_name });
    }
    return;
  }

  const local = loadSettings();
  const merged: GameSettings = {
    ...local,
    masterVolume: data.master_volume ?? local.masterVolume,
    sfxVolume: data.sfx_volume ?? local.sfxVolume,
    screenShake: data.screen_shake ?? local.screenShake,
    aiDifficulty: isDifficulty(data.ai_difficulty) ? data.ai_difficulty : local.aiDifficulty,
    displayName: profile?.display_name ?? local.displayName,
  };
  saveSettings(merged);
}

/** Push local settings to Supabase (fire-and-forget). */
export async function pushCloudSettings(settings: GameSettings = loadSettings()): Promise<void> {
  const sb = getSupabase();
  const uid = await ensureGuestSession();
  if (!sb || !uid) return;

  const { error } = await sb.from('user_settings').upsert({
    user_id: uid,
    master_volume: settings.masterVolume,
    sfx_volume: settings.sfxVolume,
    screen_shake: settings.screenShake,
    ai_difficulty: settings.aiDifficulty,
  });
  if (error) console.warn('[spellbrawl] settings sync failed:', error.message);

  await sb
    .from('profiles')
    .update({ display_name: settings.displayName, updated_at: new Date().toISOString() })
    .eq('id', uid);
}

function placementForMatch(match: Match): number {
  const sorted = [...match.fighters].sort((a, b) => b.roundWins - a.roundWins);
  const idx = sorted.findIndex((f) => f.isPlayer);
  return idx >= 0 ? idx + 1 : match.fighters.length;
}

/** Record solo match result and roll up lifetime stats. */
export async function persistSoloMatch(match: Match, stats: CombatStats): Promise<void> {
  const sb = getSupabase();
  const uid = await ensureGuestSession();
  if (!sb || !uid || !match.winner) return;

  const placement = placementForMatch(match);
  const won = match.winner.isPlayer;

  const { error: histErr } = await sb.from('match_history').insert({
    user_id: uid,
    mode: 'solo',
    placement,
    rounds_won: match.player.roundWins,
    opponents: match.fighters.length - 1,
    duration_sec: 0,
    stats: stats as unknown as Json,
  });
  if (histErr) {
    console.warn('[spellbrawl] match history failed:', histErr.message);
    return;
  }

  const { data: row } = await sb.from('player_stats').select('*').eq('user_id', uid).maybeSingle();

  const prev = row ?? {
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
  };

  const { error: statsErr } = await sb.from('player_stats').upsert({
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
  if (statsErr) console.warn('[spellbrawl] player stats failed:', statsErr.message);
}

/** Boot cloud auth + settings on game start. */
export async function bootstrapCloud(): Promise<void> {
  if (!getSupabase()) return;
  await ensureGuestSession();
  await pullCloudSettings();
}
