import { randInt } from '../engine/rng';
import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import { loadSettings } from '../game/settings';
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
  status = 'Online battles — create a room or join with a code.';

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.mode = 'menu';
    this.roomCode = '';
    this.joinInput = '';
    this.status = 'Online battles — create a room or join with a code.';
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
        this.status = `Room ${this.roomCode} — share the code. (PartyKit sync coming soon)`;
        return;
      }
      if (hit(bx, H * 0.42 + 80, bw, 64)) {
        this.mode = 'join';
        this.joinInput = '';
        this.status = 'Enter a 6-character room code.';
        return;
      }
      if (hit(bx, H - 90, bw, 44)) {
        this.ctx.toMenu();
      }
      return;
    }

    if (this.mode === 'create') {
      if (hit(bx, H * 0.58, bw, 52)) {
        void navigator.clipboard?.writeText(this.roomCode);
        this.status = 'Code copied! Friends can join when multiplayer server is live.';
      }
      if (hit(bx, H - 90, bw, 44)) {
        this.mode = 'menu';
      }
      return;
    }

    if (this.mode === 'join') {
      const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < keys.length; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        const kx = bx + col * 30;
        const ky = H * 0.5 + row * 34;
        if (hit(kx, ky, 28, 30) && this.joinInput.length < 6) {
          this.joinInput += keys[i];
        }
      }
      if (hit(bx + bw - 70, H * 0.44, 60, 36) && this.joinInput.length > 0) {
        this.joinInput = this.joinInput.slice(0, -1);
      }
      if (hit(bx, H * 0.72, bw, 52) && this.joinInput.length === 6) {
        this.status = `Joining ${this.joinInput}… (PartyKit server not connected yet — use solo for now)`;
      }
      if (hit(bx, H - 90, bw, 44)) {
        this.mode = 'menu';
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
    g.fillText('PLAY ONLINE', W / 2, H * 0.2);

    g.font = '500 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText(this.status, W / 2, H * 0.28);

    const bw = 320;
    const bx = W / 2 - bw / 2;
    const name = loadSettings().displayName;

    g.font = '500 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(180, 190, 240, 0.6)';
    g.fillText(`Playing as: ${name}`, W / 2, H * 0.34);

    if (this.mode === 'menu') {
      drawBtn(g, bx, H * 0.42, bw, 64, 'CREATE ROOM', 'get a 6-letter code');
      drawBtn(g, bx, H * 0.42 + 80, bw, 64, 'JOIN ROOM', 'enter a friend\'s code');
    } else if (this.mode === 'create') {
      g.font = '800 56px system-ui, monospace';
      g.fillStyle = '#9fe8ff';
      g.fillText(this.roomCode, W / 2, H * 0.48);
      drawBtn(g, bx, H * 0.58, bw, 52, 'COPY CODE', '');
    } else if (this.mode === 'join') {
      g.font = '800 40px system-ui, monospace';
      g.fillStyle = '#ffe94d';
      g.fillText(this.joinInput.padEnd(6, '_'), W / 2, H * 0.44);
      drawBtn(g, bx, H * 0.72, bw, 52, 'JOIN', this.joinInput.length === 6 ? 'ready' : 'need 6 chars');
    }

    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(130, 140, 255, 0.9)';
    g.fillText('BACK', W / 2, H - 50);
  }
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
