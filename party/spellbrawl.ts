import type * as Party from 'partykit/server';
import { grantBoon, rollDraft } from '../src/game/boons';
import { ROUNDS_TO_WIN } from '../src/game/constants';
import { ArenaSim, fighterColors } from '../src/game/sim/arena-sim';
import type { PlayerInput } from '../src/game/sim/types';
import type { BoonSnap, LobbyPlayer, RoomPhase } from '../src/game/sim/types';
import type { Fighter } from '../src/game/match';
import type { OwnedBoon } from '../src/game/types';

const MAX_PLAYERS = 4;
const TICK_MS = 50; // 20 Hz authoritative sim

interface PlayerRec {
  connId: string;
  slot: number;
  name: string;
  userId?: string;
  ready: boolean;
}

function boonToSnap(b: OwnedBoon): BoonSnap {
  return {
    id: b.def.id,
    name: b.def.name,
    school: b.def.school,
    slot: b.def.slot,
    rarity: b.rarity,
    level: b.level,
    describe: b.def.describe(b.level * (b.rarity === 'common' ? 1 : b.rarity === 'rare' ? 1.5 : 2.2)),
  };
}

export default class SpellbrawlRoom implements Party.Server {
  phase: RoomPhase = 'lobby';
  players = new Map<string, PlayerRec>();
  hostId: string | null = null;
  fighters: Fighter[] = [];
  sim: ArenaSim | null = null;
  round = 1;
  draftOffers = new Map<number, OwnedBoon[]>();
  draftPicked = new Set<number>();
  latestInput = new Map<number, PlayerInput>();
  tickHandle: ReturnType<typeof setInterval> | null = null;
  simTick = 0;

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection): void {
    conn.send(JSON.stringify({ t: 'hello', code: this.room.id.toUpperCase() }));
    this.sendLobby(conn);
  }

  onClose(conn: Party.Connection): void {
    this.players.delete(conn.id);
    if (this.hostId === conn.id) {
      this.hostId = this.players.keys().next().value?.toString() ?? null;
    }
    if (this.players.size === 0) {
      this.stopSim();
      this.phase = 'lobby';
      this.sim = null;
      this.fighters = [];
    }
    this.broadcastLobby();
  }

  onMessage(raw: string | ArrayBuffer, sender: Party.Connection): void {
    let msg: { t: string; [k: string]: unknown };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    switch (msg.t) {
      case 'join':
        this.handleJoin(sender, String(msg.name ?? 'Wizard'), msg.userId as string | undefined);
        break;
      case 'ready':
        this.setReady(sender, Boolean(msg.value));
        break;
      case 'start':
        this.handleStart(sender);
        break;
      case 'input':
        this.handleInput(sender, msg);
        break;
      case 'draft':
        this.handleDraftPick(sender, Number(msg.index));
        break;
      case 'leave_match':
        this.returnToLobby();
        break;
    }
  }

  private handleJoin(conn: Party.Connection, name: string, userId?: string): void {
    if (this.phase !== 'lobby' && this.phase !== 'match_results') {
      conn.send(JSON.stringify({ t: 'err', msg: 'Match in progress' }));
      return;
    }
    if (this.players.has(conn.id)) return;
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Room is full (4 players max)' }));
      return;
    }

    const slot = this.players.size;
    const rec: PlayerRec = {
      connId: conn.id,
      slot,
      name: name.slice(0, 16) || 'Wizard',
      userId,
      ready: false,
    };
    this.players.set(conn.id, rec);
    if (!this.hostId) this.hostId = conn.id;
    this.sendLobby(conn);
    this.broadcastLobby();
  }

  private setReady(conn: Party.Connection, value: boolean): void {
    const p = this.players.get(conn.id);
    if (!p) return;
    p.ready = value;
    this.broadcastLobby();
  }

  private handleStart(conn: Party.Connection): void {
    if (conn.id !== this.hostId) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Only the host can start' }));
      return;
    }
    if (this.players.size < 2) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Need at least 2 players' }));
      return;
    }
    if (this.phase !== 'lobby') return;

    this.fighters = [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p, i) => ({
        id: i,
        name: p.name,
        color: fighterColors[i] ?? fighterColors[0],
        isPlayer: false,
        boons: [] as OwnedBoon[],
        roundWins: 0,
      }));

    this.round = 1;
    this.beginDraft();
  }

  private beginDraft(): void {
    this.phase = 'draft';
    this.draftOffers.clear();
    this.draftPicked.clear();

    for (const f of this.fighters) {
      const offers = rollDraft(f.boons);
      this.draftOffers.set(f.id, offers);
      const conn = this.connForSlot(f.id);
      if (conn) {
        conn.send(
          JSON.stringify({
            t: 'draft',
            offers: offers.map(boonToSnap),
            round: this.round,
          }),
        );
      }
    }
    this.room.broadcast(JSON.stringify({ t: 'draft_wait', round: this.round }));
  }

  private handleDraftPick(conn: Party.Connection, index: number): void {
    const rec = this.players.get(conn.id);
    if (!rec || this.phase !== 'draft') return;
    const offers = this.draftOffers.get(rec.slot);
    if (!offers || this.draftPicked.has(rec.slot)) return;
    const pick = offers[clamp(index, 0, offers.length - 1)];
    if (!pick) return;

    const fighter = this.fighters[rec.slot];
    grantBoon(fighter.boons, pick);
    this.draftPicked.add(rec.slot);

    if (this.draftPicked.size >= this.fighters.length) {
      this.beginArena();
    }
  }

  private beginArena(): void {
    this.phase = 'arena';
    this.sim = new ArenaSim(this.fighters, { round: this.round, seed: hashCode(this.room.id) + this.round });
    this.simTick = 0;
    this.latestInput.clear();
    this.room.broadcast(JSON.stringify({ t: 'arena_start', round: this.round }));
    this.startSimLoop();
  }

  private startSimLoop(): void {
    this.stopSim();
    this.tickHandle = setInterval(() => this.simStep(), TICK_MS);
  }

  private stopSim(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private simStep(): void {
    const sim = this.sim;
    if (!sim || this.phase !== 'arena') return;

    for (const f of this.fighters) {
      const input = this.latestInput.get(f.id);
      if (input) sim.applyInput(f.id, input);
    }

    sim.tick(TICK_MS / 1000);
    this.simTick++;

    const snap = sim.getSnapshot(this.simTick);
    this.room.broadcast(JSON.stringify({ t: 'state', snap }));

    if (sim.roundEnded) {
      const matchOver = sim.consumeRoundEnd();
      this.stopSim();

      if (matchOver) {
        this.phase = 'match_results';
        const winner = this.fighters.find((f) => f.roundWins >= ROUNDS_TO_WIN) ?? null;
        this.room.broadcast(
          JSON.stringify({
            t: 'match_end',
            winnerId: winner?.id ?? null,
            standings: this.fighters.map((f) => ({
              id: f.id,
              name: f.name,
              roundWins: f.roundWins,
              color: f.color,
            })),
            stats: sim.statsTracker.getAll(),
          }),
        );
      } else {
        this.phase = 'round_results';
        this.round = sim.fighters[0] ? this.round + 1 : this.round;
        this.room.broadcast(
          JSON.stringify({
            t: 'round_end',
            winnerId: sim.roundWinner?.id ?? null,
            banner: sim.banner,
            roundWins: this.fighters.map((f) => ({ id: f.id, wins: f.roundWins })),
          }),
        );
        setTimeout(() => {
          if (this.phase === 'round_results') {
            this.round++;
            this.beginDraft();
          }
        }, 2800);
      }
    }
  }

  private handleInput(conn: Party.Connection, msg: { [k: string]: unknown }): void {
    const rec = this.players.get(conn.id);
    if (!rec || this.phase !== 'arena') return;
    this.latestInput.set(rec.slot, {
      moveX: Number(msg.moveX) || 0,
      moveY: Number(msg.moveY) || 0,
      aimX: Number(msg.aimX) || 0,
      aimY: Number(msg.aimY) || 0,
      attack: Boolean(msg.attack),
      shield: Boolean(msg.shield),
      dash: Boolean(msg.dash),
    });
  }

  private returnToLobby(): void {
    this.stopSim();
    this.phase = 'lobby';
    this.sim = null;
    this.fighters = [];
    this.draftOffers.clear();
    this.draftPicked.clear();
    for (const p of this.players.values()) p.ready = false;
    this.broadcastLobby();
  }

  private connForSlot(slot: number): Party.Connection | undefined {
    for (const conn of this.room.getConnections()) {
      const rec = this.players.get(conn.id);
      if (rec?.slot === slot) return conn;
    }
    return undefined;
  }

  private lobbyPlayers(): LobbyPlayer[] {
    return [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        connId: p.connId,
        slot: p.slot,
        name: p.name,
        color: fighterColors[p.slot] ?? fighterColors[0],
        ready: p.ready,
        userId: p.userId,
      }));
  }

  private sendLobby(conn: Party.Connection): void {
    conn.send(
      JSON.stringify({
        t: 'lobby',
        code: this.room.id.toUpperCase(),
        hostId: this.hostId,
        phase: this.phase,
        players: this.lobbyPlayers(),
        you: this.players.get(conn.id)?.slot ?? -1,
      }),
    );
  }

  private broadcastLobby(): void {
    this.room.broadcast(
      JSON.stringify({
        t: 'lobby',
        code: this.room.id.toUpperCase(),
        hostId: this.hostId,
        phase: this.phase,
        players: this.lobbyPlayers(),
      }),
    );
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
