import type { GameCtx } from '../game/context';
import { partyClient, type ServerMessage } from './party';

/** Persistent handler for party server messages — owns scene transitions. */
export function initPartyCoordinator(ctx: GameCtx): void {
  partyClient.on((msg) => handlePartyMessage(ctx, msg));
}

function handlePartyMessage(ctx: GameCtx, msg: ServerMessage): void {
  switch (msg.t) {
    case 'draft':
    case 'draft_wait':
      ctx.startOnlineDraft();
      break;
    case 'arena_start':
      ctx.startOnlineArena();
      break;
    case 'match_end':
      ctx.endOnlineMatch(msg);
      break;
    case 'err':
      break;
    default:
      break;
  }
}
