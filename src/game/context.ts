import type { Input } from '../engine/input';
import type { Viewport } from '../engine/viewport';
import type { Match } from './match';

/** Shared services and flow transitions available to every scene. */
export interface GameCtx {
  input: Input;
  viewport: Viewport;
  match: Match | null;
  /** Menu -> new match -> opening draft. */
  startMatch(enemyCount: number): void;
  /** Between rounds (and before round 1): boon draft. */
  startDraft(): void;
  /** Draft -> combat round. */
  startRound(): void;
  /** Match decided -> results screen. */
  endMatch(): void;
  toMenu(): void;
  toSettings(): void;
  toLobby(): void;
}
