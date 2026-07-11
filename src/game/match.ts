import { ENEMY_INFO, PLAYER_COLOR, ROUNDS_TO_WIN } from './constants';
import type { OwnedBoon } from './types';
import { MatchStatsTracker } from './stats';

/** Persistent per-match combatant identity: survives across rounds. */
export interface Fighter {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  boons: OwnedBoon[];
  roundWins: number;
}

export class Match {
  fighters: Fighter[];
  round = 1;
  winner: Fighter | null = null;
  /** AI draft picks from the most recent draft, for announcing to the player. */
  lastAiPicks: { fighter: Fighter; boon: OwnedBoon }[] = [];
  /** The player's most recent draft pick, shown during the round countdown. */
  lastPlayerPick: OwnedBoon | null = null;
  /** Combat counters accumulated across all rounds in this match. */
  readonly statsTracker = new MatchStatsTracker();

  constructor(enemyCount: number) {
    this.fighters = [
      { id: 0, name: 'You', color: PLAYER_COLOR, isPlayer: true, boons: [], roundWins: 0 },
      ...ENEMY_INFO.slice(0, enemyCount).map((info, i) => ({
        id: i + 1,
        name: info.name,
        color: info.color,
        isPlayer: false,
        boons: [] as OwnedBoon[],
        roundWins: 0,
      })),
    ];
  }

  get player(): Fighter {
    return this.fighters[0];
  }

  /** Award a round win; returns true if that ended the match. */
  scoreRound(winner: Fighter | null): boolean {
    if (winner) {
      winner.roundWins++;
      if (winner.roundWins >= ROUNDS_TO_WIN) {
        this.winner = winner;
        return true;
      }
    }
    this.round++;
    return false;
  }
}
