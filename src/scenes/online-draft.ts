import { sfx } from '../engine/audio';
import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import type { BoonSnap } from '../game/sim/types';
import { RARITY_COLORS, type School } from '../game/types';
import { partyClient } from '../net/party';
import { drawSigil } from '../ui/sigil';
import { roundedRect, wrapText } from '../ui/text';

export class OnlineDraftScene implements Scene {
  private offers: BoonSnap[] = [];
  private picked = false;
  private round = 1;
  private time = 0;
  private unsub: (() => void) | null = null;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.offers = [];
    this.picked = false;
    this.time = 0;
    this.unsub = partyClient.on((msg) => {
      if (msg.t === 'draft') {
        this.offers = msg.offers;
        this.round = msg.round;
        this.picked = false;
      }
    });
  }

  exit(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private cardRect(i: number): { x: number; y: number; w: number; h: number } {
    const W = this.ctx.viewport.width;
    const H = this.ctx.viewport.height;
    const w = 280;
    const h = 360;
    const gap = 28;
    const n = Math.max(this.offers.length, 1);
    const x = W / 2 - (n * w + (n - 1) * gap) / 2 + i * (w + gap);
    const y = H / 2 - h / 2 + 10;
    return { x, y, w, h };
  }

  update(dt: number): void {
    this.time += dt;
    if (this.picked || this.offers.length === 0) return;

    const { input } = this.ctx;
    if (!input.wasClicked(0)) return;

    for (let i = 0; i < this.offers.length; i++) {
      const r = this.cardRect(i);
      if (
        input.mouse.x >= r.x &&
        input.mouse.x <= r.x + r.w &&
        input.mouse.y >= r.y &&
        input.mouse.y <= r.y + r.h
      ) {
        partyClient.pickDraft(i);
        this.picked = true;
        sfx.draftPick();
        return;
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const W = this.ctx.viewport.width;
    const H = this.ctx.viewport.height;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 40px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`ROUND ${this.round} DRAFT`, W / 2, H * 0.14);

    g.font = '500 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText(
      this.picked ? 'Waiting for other wizards…' : 'Pick one boon for this round',
      W / 2,
      H * 0.2,
    );

    this.offers.forEach((b, i) => {
      const r = this.cardRect(i);
      g.fillStyle = 'rgba(16, 17, 36, 0.95)';
      roundedRect(g, r.x, r.y, r.w, r.h, 12);
      g.fill();
      g.strokeStyle = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#888';
      g.lineWidth = 2;
      roundedRect(g, r.x, r.y, r.w, r.h, 12);
      g.stroke();

      drawSigil(g, b.school as School, r.x + r.w / 2, r.y + 70, 48);

      g.font = '800 20px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(b.name, r.x + r.w / 2, r.y + 130);

      g.font = '600 12px system-ui, sans-serif';
      g.fillStyle = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#aaa';
      g.fillText(`${b.rarity.toUpperCase()} · Lv ${b.level}`, r.x + r.w / 2, r.y + 152);

      g.textAlign = 'left';
      g.font = '500 14px system-ui, sans-serif';
      g.fillStyle = 'rgba(220, 224, 255, 0.85)';
      const lines = wrapText(g, b.describe, r.w - 36);
      lines.forEach((line, li) => g.fillText(line, r.x + 18, r.y + 180 + li * 18));
      g.textAlign = 'center';
    });
  }
}
