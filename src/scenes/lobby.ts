import { randInt } from '../engine/rng';
import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import { loadSettings } from '../game/settings';
import { partyClient } from '../net/party';
import { roundedRect } from '../ui/text';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[randInt(0, CODE_CHARS.length - 1)];
  return code;
}

type LobbyMode = 'menu' | 'create' | 'join';

export class LobbyScene implements Scene {
  mode: LobbyMode = 'menu';
  roomCode = '';
  joinInput = '';
  status = 'Create a room or join with a 6-character code.';
  private unsub: (() => void) | null = null;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.unsub?.();
    this.unsub = partyClient.on((msg) => {
      if (msg.t === 'lobby') {
        this.status = lobbyStatus(msg);
        if (msg.you !== undefined && msg.you >= 0) partyClient.mySlot = msg.you;
      }
      if (msg.t === 'err') this.status = msg.msg;
      if (msg.t === 'draft' || msg.t === 'draft_wait') this.ctx.startOnlineDraft();
      if (msg.t === 'arena_start') this.ctx.startOnlineArena();
    });
  }

  exit(): void {
    this.unsub?.();
    this.unsub = null;
  }

  update(_dt: number): void {
    const { input } = this.ctx;
    if (!input.wasClicked(0)) return;

    const W = this.ctx.viewport.width;
    const H = this.ctx.viewport.height;
    const cx = W / 2;
    const bw = 320;
    const bx = cx - bw / 2;

    const hit = (x: number, y: number, w: number, h: number) =>
      input.mouse.x >= x && input.mouse.x <= x + w && input.mouse.y >= y && input.mouse.y <= y + h;

    if (this.mode === 'menu') {
      if (hit(bx, H * 0.42, bw, 64)) {
        this.mode = 'create';
        this.roomCode = generateRoomCode();
        partyClient.connect(this.roomCode, loadSettings().displayName);
        history.replaceState(null, '', `/join/${this.roomCode}`);
        this.status = `Room ${this.roomCode} — waiting for players…`;
        return;
      }
      if (hit(bx, H * 0.42 + 80, bw, 64)) {
        this.mode = 'join';
        this.joinInput = '';
        this.status = 'Enter a 6-character room code.';
        return;
      }
      if (hit(bx, H - 90, bw, 44)) {
        partyClient.disconnect();
        this.ctx.toMenu();
      }
      return;
    }

    if (this.mode === 'create') {
      if (hit(bx, H * 0.72, bw, 52)) {
        partyClient.startMatch();
      }
      if (hit(bx, H * 0.58, bw, 52)) {
        const link = `${location.origin}/join/${this.roomCode}`;
        void navigator.clipboard?.writeText(link);
        this.status = 'Invite link copied!';
      }
      if (hit(bx, H - 90, bw, 44)) {
        partyClient.disconnect();
        this.mode = 'menu';
        history.replaceState(null, '', '/');
      }
      return;
    }

    if (this.mode === 'join') {
      const keys = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i = 0; i < keys.length; i++) {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const kx = bx + col * 34;
        const ky = H * 0.48 + row * 36;
        if (hit(kx, ky, 32, 32) && this.joinInput.length < 6) {
          this.joinInput += keys[i];
        }
      }
      if (hit(bx + bw - 70, H * 0.42, 60, 36) && this.joinInput.length > 0) {
        this.joinInput = this.joinInput.slice(0, -1);
      }
      if (hit(bx, H * 0.72, bw, 52) && this.joinInput.length === 6) {
        partyClient.connect(this.joinInput, loadSettings().displayName);
        history.replaceState(null, '', `/join/${this.joinInput}`);
        this.status = `Joining ${this.joinInput}…`;
      }
      if (hit(bx, H - 90, bw, 44)) {
        partyClient.disconnect();
        this.mode = 'menu';
        history.replaceState(null, '', '/');
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { viewport } = this.ctx;
    const W = viewport.width;
    const H = viewport.height;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 44px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText('PLAY ONLINE', W / 2, H * 0.18);

    g.font = '500 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText(this.status, W / 2, H * 0.26);

    const bw = 320;
    const bx = W / 2 - bw / 2;
    const name = loadSettings().displayName;

    g.font = '500 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(180, 190, 240, 0.6)';
    g.fillText(`Playing as: ${name}`, W / 2, H * 0.32);

    if (this.mode === 'menu') {
      drawBtn(g, bx, H * 0.42, bw, 64, 'CREATE ROOM', 'get a 6-letter code');
      drawBtn(g, bx, H * 0.42 + 80, bw, 64, 'JOIN ROOM', "enter a friend's code");
    } else if (this.mode === 'create') {
      g.font = '800 56px system-ui, monospace';
      g.fillStyle = '#9fe8ff';
      g.fillText(this.roomCode, W / 2, H * 0.44);
      drawBtn(g, bx, H * 0.58, bw, 52, 'COPY INVITE LINK', '');
      const canStart = partyClient.players.length >= 2;
      drawBtn(g, bx, H * 0.72, bw, 52, 'START MATCH', canStart ? 'host only · 2+ players' : 'need 2+ players');
      this.renderSlots(g, W, H * 0.52);
    } else if (this.mode === 'join') {
      g.font = '800 40px system-ui, monospace';
      g.fillStyle = '#ffe94d';
      g.fillText(this.joinInput.padEnd(6, '_'), W / 2, H * 0.4);
      drawBtn(g, bx, H * 0.72, bw, 52, 'JOIN', this.joinInput.length === 6 ? 'connect' : 'need 6 chars');
      if (partyClient.connected) this.renderSlots(g, W, H * 0.52);
    }

    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(130, 140, 255, 0.9)';
    g.fillText('BACK', W / 2, H - 50);
  }

  private renderSlots(g: CanvasRenderingContext2D, W: number, y: number): void {
    const slots = 4;
    const sw = 68;
    const gap = 12;
    const startX = W / 2 - (slots * sw + (slots - 1) * gap) / 2;
    for (let i = 0; i < slots; i++) {
      const p = partyClient.players.find((pl) => pl.slot === i);
      const x = startX + i * (sw + gap);
      g.fillStyle = p ? 'rgba(40, 50, 120, 0.8)' : 'rgba(20, 22, 40, 0.6)';
      roundedRect(g, x, y, sw, 56, 8);
      g.fill();
      g.strokeStyle = p ? p.color : 'rgba(100, 110, 180, 0.3)';
      g.lineWidth = 2;
      roundedRect(g, x, y, sw, 56, 8);
      g.stroke();
      g.font = '600 11px system-ui, sans-serif';
      g.fillStyle = p ? '#fff' : 'rgba(150,160,200,0.4)';
      g.fillText(p ? p.name.slice(0, 8) : 'empty', x + sw / 2, y + 32);
    }
  }
}

function lobbyStatus(msg: { players: { name: string }[]; phase: string }): string {
  const n = msg.players.length;
  if (msg.phase !== 'lobby') return 'Match in progress…';
  return `${n}/4 players in room`;
}

function drawBtn(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  sub: string,
): void {
  g.fillStyle = 'rgba(20, 22, 48, 0.9)';
  roundedRect(g, x, y, w, h, 10);
  g.fill();
  g.strokeStyle = 'rgba(130, 140, 255, 0.45)';
  g.lineWidth = 1.5;
  roundedRect(g, x, y, w, h, 10);
  g.stroke();
  g.textAlign = 'center';
  g.font = '800 20px system-ui, sans-serif';
  g.fillStyle = '#fff';
  g.fillText(label, x + w / 2, y + (sub ? h * 0.42 : h / 2));
  if (sub) {
    g.font = '500 13px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.65)';
    g.fillText(sub, x + w / 2, y + h * 0.72);
  }
}
