import PartySocket from 'partysocket';
import type { BoonSnap, LobbyPlayer, RoomPhase, SimSnapshot } from '../game/sim/types';
import { getUserId } from './auth';

export type PartyListener = (msg: ServerMessage) => void;

export type ServerMessage =
  | { t: 'hello'; code: string }
  | { t: 'lobby'; code: string; hostId: string | null; phase: RoomPhase; players: LobbyPlayer[]; you?: number }
  | { t: 'err'; msg: string }
  | { t: 'draft'; offers: BoonSnap[]; round: number }
  | { t: 'draft_wait'; round: number }
  | { t: 'arena_start'; round: number }
  | { t: 'state'; snap: SimSnapshot }
  | { t: 'round_end'; winnerId: number | null; banner: string; roundWins: { id: number; wins: number }[] }
  | {
      t: 'match_end';
      winnerId: number | null;
      standings: { id: number; name: string; roundWins: number; color: string }[];
      stats: unknown;
    };

function partyHost(): string {
  const h = import.meta.env.VITE_PARTYKIT_HOST;
  if (!h) return 'localhost:8787';
  if (h.startsWith('http')) return new URL(h).host;
  return h;
}

export class PartyClient {
  private socket: PartySocket | null = null;
  private listeners = new Set<PartyListener>();
  mySlot = -1;
  hostId: string | null = null;
  code = '';
  phase: RoomPhase = 'lobby';
  players: LobbyPlayer[] = [];
  connected = false;

  on(fn: PartyListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(msg: ServerMessage): void {
    for (const fn of this.listeners) fn(msg);
  }

  connect(roomCode: string, displayName: string): void {
    this.disconnect();
    const code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.code = code;
    const host = partyHost();
    const protocol = host.includes('localhost') || host.startsWith('127.') ? 'ws' : 'wss';
    this.socket = new PartySocket({
      host,
      room: code,
      party: 'spellbrawl',
      protocol,
    });

    this.socket.addEventListener('open', () => {
      this.connected = true;
      this.send({ t: 'join', name: displayName, userId: getUserId() ?? undefined });
    });

    this.socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        if (msg.t === 'lobby') {
          this.hostId = msg.hostId;
          this.phase = msg.phase;
          this.players = msg.players;
          if (msg.you !== undefined) this.mySlot = msg.you;
        }
        this.emit(msg);
      } catch {
        /* ignore */
      }
    });

    this.socket.addEventListener('close', () => {
      this.connected = false;
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connected = false;
    this.mySlot = -1;
    this.players = [];
  }

  send(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  setReady(value: boolean): void {
    this.send({ t: 'ready', value });
  }

  startMatch(): void {
    this.send({ t: 'start' });
  }

  sendInput(input: {
    moveX: number;
    moveY: number;
    aimX: number;
    aimY: number;
    attack: boolean;
    shield: boolean;
    dash: boolean;
  }): void {
    this.send({ t: 'input', ...input });
  }

  pickDraft(index: number): void {
    this.send({ t: 'draft', index });
  }

  leaveMatch(): void {
    this.send({ t: 'leave_match' });
  }
}

export const partyClient = new PartyClient();

export function isPartyConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PARTYKIT_HOST || import.meta.env.DEV);
}
