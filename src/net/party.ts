import PartySocket from 'partysocket';
import type { BoonSnap, LobbyPlayer, RoomPhase, SimSnapshot } from '../game/sim/types';
import { getUserId } from './auth';

export type PartyListener = (msg: ServerMessage) => void;
export type ConnectionListener = (status: ConnectionStatus) => void;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type ServerMessage =
  | { t: 'hello'; code: string }
  | { t: 'lobby'; code: string; hostId: string | null; phase: RoomPhase; players: LobbyPlayer[]; you?: number }
  | { t: 'err'; msg: string }
  | { t: 'draft'; offers: BoonSnap[]; build: BoonSnap[]; round: number }
  | { t: 'draft_wait'; round: number }
  | { t: 'arena_start'; round: number }
  | { t: 'state'; snap: SimSnapshot }
  | { t: 'round_end'; winnerId: number | null; banner: string; roundWins: { id: number; wins: number }[] }
  | {
      t: 'match_end';
      winnerId: number | null;
      standings: { id: number; name: string; roundWins: number; color: string }[];
      stats: Record<string, import('../game/stats').CombatStats>;
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
  private connectionListeners = new Set<ConnectionListener>();
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastDisplayName = 'Wizard';
  private inMatch = false;

  mySlot = -1;
  hostId: string | null = null;
  code = '';
  phase: RoomPhase = 'lobby';
  players: LobbyPlayer[] = [];
  connected = false;
  connectionStatus: ConnectionStatus = 'disconnected';
  lastError = '';

  draftOffers: BoonSnap[] = [];
  draftBuild: BoonSnap[] = [];
  draftRound = 1;
  roundEnd: Extract<ServerMessage, { t: 'round_end' }> | null = null;
  latestSnap: SimSnapshot | null = null;

  on(fn: PartyListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onConnectionChange(fn: ConnectionListener): () => void {
    this.connectionListeners.add(fn);
    return () => this.connectionListeners.delete(fn);
  }

  private emit(msg: ServerMessage): void {
    for (const fn of this.listeners) fn(msg);
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.connected = status === 'connected';
    for (const fn of this.connectionListeners) fn(status);
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || !this.code) return;
    if (this.reconnectTimer) return;
    this.setConnectionStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 8000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(this.code, this.lastDisplayName, true);
    }, delay);
  }

  connect(roomCode: string, displayName: string): void {
    this.disconnect();
    this.intentionalDisconnect = false;
    this.reconnectAttempts = 0;
    const code = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.code = code;
    this.lastDisplayName = displayName;
    this.openSocket(code, displayName, false);
  }

  private openSocket(code: string, displayName: string, isReconnect: boolean): void {
    this.socket?.close();
    this.setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

    const host = partyHost();
    const protocol = host.includes('localhost') || host.startsWith('127.') ? 'ws' : 'wss';
    this.socket = new PartySocket({
      host,
      room: code,
      party: 'spellbrawl',
      protocol,
    });

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.setConnectionStatus('connected');
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
        if (msg.t === 'draft') {
          this.draftOffers = msg.offers;
          this.draftBuild = msg.build;
          this.draftRound = msg.round;
          this.roundEnd = null;
          this.inMatch = true;
        }
        if (msg.t === 'arena_start') {
          this.roundEnd = null;
          this.inMatch = true;
        }
        if (msg.t === 'state') {
          this.latestSnap = msg.snap;
        }
        if (msg.t === 'round_end') {
          this.roundEnd = msg;
        }
        if (msg.t === 'match_end') {
          this.inMatch = false;
        }
        if (msg.t === 'err') {
          this.lastError = msg.msg;
        }
        this.emit(msg);
      } catch {
        /* ignore */
      }
    });

    this.socket.addEventListener('close', () => {
      this.setConnectionStatus('disconnected');
      if (!this.intentionalDisconnect && this.code && (this.inMatch || this.players.length > 0)) {
        this.scheduleReconnect();
      }
    });

    this.socket.addEventListener('error', () => {
      this.lastError = 'Connection error';
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.inMatch = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setConnectionStatus('disconnected');
    this.mySlot = -1;
    this.players = [];
    this.draftOffers = [];
    this.draftBuild = [];
    this.roundEnd = null;
    this.latestSnap = null;
    this.lastError = '';
  }

  send(payload: Record<string, unknown>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.lastError = 'Not connected to room';
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  setReady(value: boolean): void {
    this.send({ t: 'ready', value });
  }

  startMatch(): void {
    if (!this.send({ t: 'start' })) return;
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
    if (!this.send({ t: 'draft', index })) return;
  }

  leaveMatch(): void {
    this.inMatch = false;
    this.send({ t: 'leave_match' });
  }

  isHost(): boolean {
    const me = this.players.find((p) => p.slot === this.mySlot);
    return Boolean(me && this.hostId && me.connId === this.hostId);
  }
}

export const partyClient = new PartyClient();

export function isPartyConfigured(): boolean {
  return Boolean(import.meta.env.VITE_PARTYKIT_HOST || import.meta.env.DEV);
}
