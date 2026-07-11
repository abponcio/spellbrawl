import { getAsset } from '../engine/assets';
import type { Scene } from '../engine/scene';
import { SCHOOL_COLORS } from '../game/constants';
import type { GameCtx } from '../game/context';
import { roundedRect } from '../ui/text';

interface Button {
  label: string;
  sub: string;
  enemies?: number;
  action?: 'online' | 'settings';
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MenuScene implements Scene {
  private time = 0;
  private buttons: Button[] = [];

  constructor(private ctx: GameCtx) {}

  update(dt: number): void {
    this.time += dt;
    const { input } = this.ctx;
    if (input.wasClicked(0)) {
      for (const b of this.buttons) {
        if (
          input.mouse.x >= b.x &&
          input.mouse.x <= b.x + b.w &&
          input.mouse.y >= b.y &&
          input.mouse.y <= b.y + b.h
        ) {
          if (b.action === 'online') this.ctx.toLobby();
          else if (b.action === 'settings') this.ctx.toSettings();
          else if (b.enemies !== undefined) this.ctx.startMatch(b.enemies);
          return;
        }
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { viewport, input } = this.ctx;
    const W = viewport.width;
    const H = viewport.height;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    // generated key art behind everything, faded into the background
    const art = getAsset('title');
    if (art) {
      const scale = Math.max(W / art.width, H / art.height);
      const aw = art.width * scale;
      const ah = art.height * scale;
      g.globalAlpha = 0.4;
      g.drawImage(art, (W - aw) / 2, (H - ah) / 2, aw, ah);
      g.globalAlpha = 1;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(7, 7, 15, 0.35)');
      grad.addColorStop(0.55, 'rgba(7, 7, 15, 0.8)');
      grad.addColorStop(1, 'rgba(7, 7, 15, 0.95)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    // drifting embers backdrop
    const colors = Object.values(SCHOOL_COLORS);
    for (let i = 0; i < 40; i++) {
      const t = this.time * 0.3 + i * 137;
      const x = ((i * 353.7) % W) + Math.sin(t) * 30;
      const y = H - (((t * 40 + i * 271) % (H + 80)) - 40);
      g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2);
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(x, y, 2.2 + (i % 3), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 92px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.shadowColor = '#7080ff';
    g.shadowBlur = 34 + Math.sin(this.time * 2) * 10;
    g.fillText('SPELLBRAWL', W / 2, H * 0.24);
    g.shadowBlur = 0;

    g.font = '500 19px system-ui, sans-serif';
    g.fillStyle = 'rgba(210, 215, 255, 0.8)';
    g.fillText('Build your pressure. Break their footing. Knock them off the world.', W / 2, H * 0.33);

    // buttons
    const defs = [
      { label: 'PLAY ONLINE', sub: 'room code · up to 4 players', action: 'online' as const },
      { label: 'DUEL', sub: '1 rival wizard', enemies: 1 },
      { label: 'SKIRMISH', sub: '2 rival wizards', enemies: 2 },
      { label: 'CHAOS', sub: '3 rival wizards — free-for-all', enemies: 3 },
      { label: 'SETTINGS', sub: 'AI difficulty · audio', action: 'settings' as const },
    ];
    const bw = 320;
    const bh = 64;
    this.buttons = defs.map((d, i) => ({
      ...d,
      x: W / 2 - bw / 2,
      y: H * 0.38 + i * (bh + 14),
      w: bw,
      h: bh,
    }));

    for (const b of this.buttons) {
      const hover =
        input.mouse.x >= b.x &&
        input.mouse.x <= b.x + b.w &&
        input.mouse.y >= b.y &&
        input.mouse.y <= b.y + b.h;
      g.fillStyle = hover ? 'rgba(80, 90, 200, 0.35)' : 'rgba(20, 22, 48, 0.85)';
      roundedRect(g, b.x, b.y, b.w, b.h, 12);
      g.fill();
      g.strokeStyle = hover ? '#8f9dff' : 'rgba(130, 140, 255, 0.4)';
      g.lineWidth = hover ? 2.5 : 1.5;
      roundedRect(g, b.x, b.y, b.w, b.h, 12);
      g.stroke();

      g.font = '800 24px system-ui, sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(b.label, W / 2, b.y + 28);
      g.font = '500 14px system-ui, sans-serif';
      g.fillStyle = 'rgba(200, 205, 245, 0.7)';
      g.fillText(b.sub, W / 2, b.y + 52);
    }

    g.font = '500 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(190, 195, 235, 0.55)';
    g.fillText(
      'WASD move · Mouse aim · LMB attack · RMB shield · SPACE dash',
      W / 2,
      H - 40,
    );
  }
}
