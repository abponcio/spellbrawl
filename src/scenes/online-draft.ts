import { sfx } from '../engine/audio';
import type { Scene } from '../engine/scene';
import { SCHOOL_COLORS } from '../game/constants';
import type { GameCtx } from '../game/context';
import type { BoonSnap } from '../game/sim/types';
import { RARITY_COLORS, type School } from '../game/types';
import { partyClient } from '../net/party';
import { drawSigil } from '../ui/sigil';
import { roundedRect, wrapText } from '../ui/text';

const SLOT_LABEL: Record<string, string> = {
  attack: 'ATTACK',
  shield: 'SHIELD',
  movement: 'MOVEMENT',
};

export class OnlineDraftScene implements Scene {
  private picked = false;
  private time = 0;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.picked = false;
    this.time = 0;
  }

  private get offers(): BoonSnap[] {
    return partyClient.draftOffers;
  }

  private get build(): BoonSnap[] {
    return partyClient.draftBuild;
  }

  private get round(): number {
    return partyClient.draftRound;
  }

  private cardRect(i: number): { x: number; y: number; w: number; h: number } {
    const W = this.ctx.viewport.width;
    const H = this.ctx.viewport.height;
    const w = 280;
    const h = 380;
    const gap = 28;
    const n = Math.max(this.offers.length, 1);
    const x = W / 2 - (n * w + (n - 1) * gap) / 2 + i * (w + gap);
    const y = H / 2 - h / 2 + 10;
    return { x, y, w, h };
  }

  update(dt: number): void {
    this.time += dt;
    if (this.picked) return;

    if (this.offers.length === 0) return;

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
    const { input } = this.ctx;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 40px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`ROUND ${this.round} DRAFT`, W / 2, H * 0.1);

    g.font = '500 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText(
      this.picked
        ? 'Waiting for other wizards…'
        : this.offers.length === 0
          ? 'Receiving draft offers…'
          : 'Pick one boon for this round',
      W / 2,
      H * 0.16,
    );

    this.renderBuildSidebar(g, W, H);

    this.offers.forEach((b, i) => {
      const r = this.cardRect(i);
      const hover =
        !this.picked &&
        input.mouse.x >= r.x &&
        input.mouse.x <= r.x + r.w &&
        input.mouse.y >= r.y &&
        input.mouse.y <= r.y + r.h;

      g.save();
      if (hover) {
        g.shadowColor = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#888';
        g.shadowBlur = 18;
      }

      g.fillStyle = hover ? 'rgba(30, 32, 68, 0.98)' : 'rgba(16, 17, 36, 0.95)';
      roundedRect(g, r.x, r.y, r.w, r.h, 12);
      g.fill();
      g.strokeStyle = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#888';
      g.lineWidth = hover ? 3 : 2;
      roundedRect(g, r.x, r.y, r.w, r.h, 12);
      g.stroke();
      g.shadowBlur = 0;

      const schoolColor = SCHOOL_COLORS[b.school as keyof typeof SCHOOL_COLORS] ?? '#aaa';
      drawSigil(g, b.school as School, r.x + r.w / 2, r.y + 58, 44);

      g.font = '700 12px system-ui, sans-serif';
      g.fillStyle = schoolColor;
      g.fillText(
        `${b.wild ? 'WILDCARD  ·  ' : ''}${b.school.toUpperCase()}  ·  ${b.archetype}  ·  ${SLOT_LABEL[b.slot] ?? b.slot.toUpperCase()}`,
        r.x + r.w / 2,
        r.y + 108,
      );

      g.font = '800 22px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(b.name, r.x + r.w / 2, r.y + 140);

      g.font = '700 13px system-ui, sans-serif';
      g.fillStyle = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#aaa';
      g.fillText(
        (b.wild ? 'ONE OF A KIND · ' : '') + b.rarity.toUpperCase(),
        r.x + r.w / 2,
        r.y + 168,
      );

      g.textAlign = 'left';
      g.font = '500 15px system-ui, sans-serif';
      g.fillStyle = 'rgba(225, 228, 250, 0.9)';
      const lines = wrapText(g, b.describe, r.w - 44);
      lines.forEach((line, li) => g.fillText(line, r.x + 22, r.y + 200 + li * 22));

      if (hover) {
        g.textAlign = 'center';
        g.font = '600 13px system-ui, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillText('CLICK TO TAKE', r.x + r.w / 2, r.y + r.h - 26);
      }

      g.restore();
    });

    this.renderConnectionStatus(g, W, H);
  }

  private renderBuildSidebar(g: CanvasRenderingContext2D, _W: number, H: number): void {
    const x = 20;
    const y = H * 0.22;

    g.textAlign = 'left';
    g.font = '700 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.7)';
    g.fillText('YOUR BUILD', x, y);

    if (this.build.length === 0) {
      g.font = '500 13px system-ui, sans-serif';
      g.fillStyle = 'rgba(150, 160, 200, 0.5)';
      g.fillText('No boons yet', x, y + 28);
      return;
    }

    this.build.forEach((b, i) => {
      g.font = '600 12px system-ui, sans-serif';
      g.fillStyle = RARITY_COLORS[b.rarity as keyof typeof RARITY_COLORS] ?? '#aaa';
      g.fillText(`${b.name} (${b.rarity})`, x, y + 24 + i * 20);
    });
  }

  private renderConnectionStatus(g: CanvasRenderingContext2D, W: number, H: number): void {
    if (partyClient.connectionStatus === 'connected') return;
    g.textAlign = 'center';
    g.font = '600 14px system-ui, sans-serif';
    g.fillStyle = '#ffe94d';
    g.fillText(
      partyClient.connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connection lost',
      W / 2,
      H - 40,
    );
  }
}
