import { Server, type Connection } from 'partyserver';
import { grantBoon, rollDraft } from '../src/game/boons';
import { ROUNDS_TO_WIN } from '../src/game/constants';
import { boonArchetypeLabel } from '../src/game/skills';
import { ArenaSim, fighterColors } from '../src/game/sim/arena-sim';
import type { PlayerInput, BoonSnap, LobbyPlayer, RoomPhase } from '../src/game/sim/types';
import type { Fighter } from '../src/game/match';
import { RARITY_MULT, type OwnedBoon } from '../src/game/types';

const MAX_PLAYERS = 4;
const TICK_MS = 50;
const DRAFT_TIMEOUT_MS = 30_000;

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
    wild: Boolean(b.def.wild),
    archetype: boonArchetypeLabel(b.def, b.rarity),
    describe: b.def.describe(RARITY_MULT[b.rarity]),
  };
}

export class SpellbrawlRoom extends Server {
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
  draftTimeout: ReturnType<typeof setTimeout> | null = null;
  slotUserIds = new Map<number, string>();
  simTick = 0;

  onConnect(connection: Connection): void {
    connection.send(JSON.stringify({ t: 'hello', code: this.name.toUpperCase() }));
    this.sendLobby(connection);
  }

  onClose(connection: Connection): void {
    const rec = this.players.get(connection.id);
    this.players.delete(connection.id);
    if (this.hostId === connection.id) {
      this.hostId = this.players.keys().next().value?.toString() ?? null;
    }

    if (this.phase === 'draft' && rec) {
      this.autoPickForSlot(rec.slot);
    }

    if (this.players.size === 0) {
      this.stopSim();
      this.clearDraftTimeout();
      this.phase = 'lobby';
      this.sim = null;
      this.fighters = [];
      this.slotUserIds.clear();
    }
    this.broadcastLobby();
  }

  onMessage(connection: Connection, raw: string | ArrayBuffer): void {
    let msg: { t: string; [k: string]: unknown };
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    switch (msg.t) {
      case 'join':
        this.handleJoin(connection, String(msg.name ?? 'Wizard'), msg.userId as string | undefined);
        break;
      case 'ready':
        this.setReady(connection, Boolean(msg.value));
        break;
      case 'start':
        this.handleStart(connection);
        break;
      case 'input':
        this.handleInput(connection, msg);
        break;
      case 'draft':
        this.handleDraftPick(connection, Number(msg.index));
        break;
      case 'leave_match':
        this.returnToLobby();
        break;
    }
  }

  private handleJoin(conn: Connection, name: string, userId?: string): void {
    if (this.players.has(conn.id)) return;

    if (userId && this.phase !== 'lobby' && this.phase !== 'match_results') {
      for (const [slot, uid] of this.slotUserIds) {
        if (uid === userId && !this.connForSlot(slot)) {
          const fighter = this.fighters[slot];
          const rec: PlayerRec = {
            connId: conn.id,
            slot,
            name: (fighter?.name ?? name.slice(0, 16)) || 'Wizard',
            userId,
            ready: true,
          };
          this.players.set(conn.id, rec);
          this.sendResync(conn, slot);
          this.broadcastLobby();
          return;
        }
      }
      conn.send(JSON.stringify({ t: 'err', msg: 'Match in progress' }));
      return;
    }

    if (this.phase !== 'lobby' && this.phase !== 'match_results') {
      conn.send(JSON.stringify({ t: 'err', msg: 'Match in progress' }));
      return;
    }
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

  private setReady(conn: Connection, value: boolean): void {
    const p = this.players.get(conn.id);
    if (!p) return;
    p.ready = value;
    this.broadcastLobby();
  }

  private handleStart(conn: Connection): void {
    if (conn.id !== this.hostId) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Only the host can start' }));
      return;
    }
    if (this.players.size < 2) {
      conn.send(JSON.stringify({ t: 'err', msg: 'Need at least 2 players' }));
      return;
    }
    if (this.phase !== 'lobby') return;

    const allReady = [...this.players.values()].every((p) => p.ready);
    if (!allReady) {
      conn.send(JSON.stringify({ t: 'err', msg: 'All players must be ready' }));
      return;
    }

    this.slotUserIds.clear();
    this.fighters = [...this.players.values()]
      .sort((a, b) => a.slot - b.slot)
      .map((p, i) => {
        if (p.userId) this.slotUserIds.set(i, p.userId);
        return {
          id: i,
          name: p.name,
          color: fighterColors[i] ?? fighterColors[0],
          isPlayer: false,
          boons: [] as OwnedBoon[],
          roundWins: 0,
        };
      });

    this.round = 1;
    this.beginDraft();
  }

  private beginDraft(): void {
    this.phase = 'draft';
    this.draftOffers.clear();
    this.draftPicked.clear();
    this.clearDraftTimeout();

    for (const f of this.fighters) {
      const offers = rollDraft(f.boons);
      this.draftOffers.set(f.id, offers);
      const conn = this.connForSlot(f.id);
      if (conn) {
        conn.send(
          JSON.stringify({
            t: 'draft',
            offers: offers.map(boonToSnap),
            build: f.boons.map(boonToSnap),
            round: this.round,
          }),
        );
      }
    }
    this.broadcast(JSON.stringify({ t: 'draft_wait', round: this.round }));

    this.draftTimeout = setTimeout(() => {
      if (this.phase !== 'draft') return;
      for (const f of this.fighters) {
        this.autoPickForSlot(f.id);
      }
    }, DRAFT_TIMEOUT_MS);
  }

  private autoPickForSlot(slot: number): void {
    if (this.phase !== 'draft' || this.draftPicked.has(slot)) return;
    const offers = this.draftOffers.get(slot);
    if (!offers?.length) {
      this.draftPicked.add(slot);
      this.checkDraftComplete();
      return;
    }
    const pick = offers[0];
    const fighter = this.fighters[slot];
    if (!fighter) return;
    grantBoon(fighter.boons, pick);
    this.draftPicked.add(slot);
    this.checkDraftComplete();
  }

  private checkDraftComplete(): void {
    if (this.draftPicked.size >= this.fighters.length) {
      this.clearDraftTimeout();
      this.beginArena();
    }
  }

  private clearDraftTimeout(): void {
    if (this.draftTimeout) {
      clearTimeout(this.draftTimeout);
      this.draftTimeout = null;
    }
  }

  private handleDraftPick(conn: Connection, index: number): void {
    const rec = this.players.get(conn.id);
    if (!rec || this.phase !== 'draft') return;
    const offers = this.draftOffers.get(rec.slot);
    if (!offers || this.draftPicked.has(rec.slot)) return;
    const pick = offers[clamp(index, 0, offers.length - 1)];
    if (!pick) return;

    const fighter = this.fighters[rec.slot];
    grantBoon(fighter.boons, pick);
    this.draftPicked.add(rec.slot);

    this.checkDraftComplete();
  }

  private beginArena(): void {
    this.clearDraftTimeout();
    this.phase = 'arena';
    this.sim = new ArenaSim(this.fighters, {
      round: this.round,
      seed: hashCode(this.name) + this.round,
    });
    this.simTick = 0;
    this.latestInput.clear();
    this.broadcast(JSON.stringify({ t: 'arena_start', round: this.round }));
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
    this.broadcast(JSON.stringify({ t: 'state', snap }));

    if (sim.roundEnded) {
      const matchOver = sim.consumeRoundEnd();
      this.stopSim();

      if (matchOver) {
        this.phase = 'match_results';
        const winner = this.fighters.find((f) => f.roundWins >= ROUNDS_TO_WIN) ?? null;
        this.broadcast(
          JSON.stringify({
            t: 'match_end',
            winnerId: winner?.id ?? null,
            standings: this.fighters.map((f) => ({
              id: f.id,
              name: f.name,
              roundWins: f.roundWins,
              color: f.color,
            })),
            stats: Object.fromEntries(sim.statsTracker.getAll()),
          }),
        );
      } else {
        this.phase = 'round_results';
        this.broadcast(
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

  private handleInput(conn: Connection, msg: { [k: string]: unknown }): void {
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
    this.clearDraftTimeout();
    this.phase = 'lobby';
    this.sim = null;
    this.fighters = [];
    this.draftOffers.clear();
    this.draftPicked.clear();
    this.slotUserIds.clear();
    for (const p of this.players.values()) p.ready = false;
    this.broadcastLobby();
  }

  private sendResync(conn: Connection, slot: number): void {
    const fighter = this.fighters[slot];
    if (!fighter) return;

    if (this.phase === 'draft') {
      const offers = this.draftOffers.get(slot) ?? [];
      conn.send(
        JSON.stringify({
          t: 'draft',
          offers: offers.map(boonToSnap),
          build: fighter.boons.map(boonToSnap),
          round: this.round,
        }),
      );
      if (this.draftPicked.has(slot)) {
        conn.send(JSON.stringify({ t: 'draft_wait', round: this.round }));
      }
    } else if (this.phase === 'arena' && this.sim) {
      conn.send(JSON.stringify({ t: 'arena_start', round: this.round }));
      conn.send(JSON.stringify({ t: 'state', snap: this.sim.getSnapshot(this.simTick) }));
    } else if (this.phase === 'round_results') {
      conn.send(JSON.stringify({ t: 'arena_start', round: this.round }));
      if (this.sim) {
        conn.send(JSON.stringify({ t: 'state', snap: this.sim.getSnapshot(this.simTick) }));
      }
    }

    this.sendLobby(conn);
  }

  private connForSlot(slot: number): Connection | undefined {
    for (const conn of this.getConnections()) {
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

  private sendLobby(conn: Connection): void {
    conn.send(
      JSON.stringify({
        t: 'lobby',
        code: this.name.toUpperCase(),
        hostId: this.hostId,
        phase: this.phase,
        players: this.lobbyPlayers(),
        you: this.players.get(conn.id)?.slot ?? -1,
      }),
    );
  }

  private broadcastLobby(): void {
    this.broadcast(
      JSON.stringify({
        t: 'lobby',
        code: this.name.toUpperCase(),
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
