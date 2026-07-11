import { sfx } from '../engine/audio';
import type { Scene } from '../engine/scene';
import { SCHOOL_COLORS } from '../game/constants';
import type { GameCtx } from '../game/context';
import { aiPickBoon } from '../game/ai';
import { grantBoon, rollDraft } from '../game/boons';
import { boonArchetypeLabel } from '../game/skills';
import { RARITY_COLORS, RARITY_MULT, type OwnedBoon } from '../game/types';
import { drawSigil } from '../ui/sigil';
import { roundedRect, wrapText } from '../ui/text';

const SLOT_LABEL: Record<string, string> = {
  attack: 'ATTACK',
  shield: 'SHIELD',
  movement: 'MOVEMENT',
};

/**
 * Between-rounds boon draft: the player picks 1 of 3, and each AI's pick
 * is announced so you know what you're walking into.
 */
export class DraftScene implements Scene {
  private offers: OwnedBoon[] = [];
  private picked = false;
  private pickedIndex = -1;
  private exitTimer = 0;
  private time = 0;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    const match = this.ctx.match!;
    this.offers = rollDraft(match.player.boons);
    this.picked = false;
    this.pickedIndex = -1;
    this.time = 0;

    // AI wizards draft immediately
    match.lastAiPicks = [];
    for (const f of match.fighters) {
      if (f.isPlayer) continue;
      const choice = aiPickBoon(rollDraft(f.boons));
      grantBoon(f.boons, choice);
      match.lastAiPicks.push({ fighter: f, boon: choice });
    }
  }

  private cardRect(i: number): { x: number; y: number; w: number; h: number } {
    const { viewport } = this.ctx;
    const w = 300;
    const h = 380;
    const gap = 36;
    const n = this.offers.length;
    const x = viewport.width / 2 - (n * w + (n - 1) * gap) / 2 + i * (w + gap);
    const y = viewport.height / 2 - h / 2 + 20;
    return { x, y, w, h };
  }

  update(dt: number): void {
    this.time += dt;

    // in the unlikely case every boon is maxed out, skip straight to combat
    if (this.offers.length === 0) {
      this.ctx.startRound();
      return;
    }

    if (this.picked) {
      this.exitTimer -= dt;
      if (this.exitTimer <= 0) this.ctx.startRound();
      return;
    }

    const { input } = this.ctx;
    if (input.wasClicked(0)) {
      for (let i = 0; i < this.offers.length; i++) {
        const r = this.cardRect(i);
        if (
          input.mouse.x >= r.x &&
          input.mouse.x <= r.x + r.w &&
          input.mouse.y >= r.y &&
          input.mouse.y <= r.y + r.h
        ) {
          const match = this.ctx.match!;
          grantBoon(match.player.boons, this.offers[i]);
          match.lastPlayerPick = this.offers[i];
          this.picked = true;
          this.pickedIndex = i;
          this.exitTimer = 0.7;
          sfx.draftPick();
          return;
        }
      }
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { viewport } = this.ctx;
    const match = this.ctx.match!;
    const W = viewport.width;
    const H = viewport.height;

    g.fillStyle = '#0a0a16';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 40px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.shadowColor = '#7080ff';
    g.shadowBlur = 22;
    g.fillText(match.round === 1 ? 'CHOOSE YOUR OPENING BOON' : 'CHOOSE A BOON', W / 2, 78);
    g.shadowBlur = 0;

    g.font = '500 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(205, 210, 250, 0.7)';
    g.fillText(`Round ${match.round} approaches...`, W / 2, 116);

    this.offers.forEach((offer, i) => this.renderCard(g, offer, i));
    this.renderBuildSidebar(g);

    // AI pick announcements
    if (match.lastAiPicks.length > 0) {
      const baseY = H - 26 - match.lastAiPicks.length * 24;
      g.font = '600 15px system-ui, sans-serif';
      match.lastAiPicks.forEach((pick, i) => {
        const y = baseY + i * 24;
        g.textAlign = 'center';
        g.fillStyle = pick.fighter.color;
        const rarity = pick.boon.rarity.toUpperCase();
        g.fillText(
          `${pick.fighter.name} drafted  ${pick.boon.def.name}  (${rarity})`,
          W / 2,
          y,
        );
      });
    }
  }

  /** Everything the player already owns — the build accumulates visibly. */
  private renderBuildSidebar(g: CanvasRenderingContext2D): void {
    const match = this.ctx.match!;
    const boons = match.player.boons;
    if (boons.length === 0) return;

    const x = 24;
    let y = 96;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = '700 13px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.65)';
    g.fillText('YOUR BUILD', x, y);
    y += 24;

    for (const b of boons) {
      g.beginPath();
      g.arc(x + 10, y, 9, 0, Math.PI * 2);
      g.fillStyle = 'rgba(12, 12, 28, 0.9)';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = b.def.wild
        ? `hsl(${(this.time * 130) % 360}, 85%, 65%)`
        : RARITY_COLORS[b.rarity];
      g.stroke();
      drawSigil(g, b.def.school, x + 10, y, 15);

      g.font = '600 13px system-ui, sans-serif';
      g.fillStyle = SCHOOL_COLORS[b.def.school];
      g.fillText(b.def.name, x + 26, y);
      y += 24;
    }
  }

  private renderCard(g: CanvasRenderingContext2D, offer: OwnedBoon, i: number): void {
    const { input } = this.ctx;
    const r = this.cardRect(i);
    const hover =
      !this.picked &&
      input.mouse.x >= r.x &&
      input.mouse.x <= r.x + r.w &&
      input.mouse.y >= r.y &&
      input.mouse.y <= r.y + r.h;
    const chosen = this.picked && this.pickedIndex === i;
    const schoolColor = SCHOOL_COLORS[offer.def.school];
    const rarityColor = offer.def.wild
      ? `hsl(${(this.time * 130) % 360}, 85%, 65%)`
      : RARITY_COLORS[offer.rarity];

    g.save();
    if (this.picked && !chosen) g.globalAlpha = 0.3;
    const lift = hover ? -10 : chosen ? -14 : 0;
    g.translate(0, lift + Math.sin(this.time * 2 + i) * 3);

    // card body
    g.fillStyle = 'rgba(16, 17, 36, 0.96)';
    roundedRect(g, r.x, r.y, r.w, r.h, 14);
    g.fill();
    g.strokeStyle = rarityColor;
    g.lineWidth = chosen ? 4 : hover ? 3 : 2;
    if (hover || chosen) {
      g.shadowColor = rarityColor;
      g.shadowBlur = 24;
    }
    roundedRect(g, r.x, r.y, r.w, r.h, 14);
    g.stroke();
    g.shadowBlur = 0;

    // school banner
    g.fillStyle = schoolColor;
    g.globalAlpha *= 0.16;
    roundedRect(g, r.x, r.y, r.w, 92, 14);
    g.fill();
    g.globalAlpha = this.picked && !chosen ? 0.3 : 1;

    // school sigil
    drawSigil(g, offer.def.school, r.x + r.w / 2, r.y + 48, 58);

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // school + archetype + slot line
    g.font = '700 12px system-ui, sans-serif';
    g.fillStyle = schoolColor;
    const archetype = boonArchetypeLabel(offer.def, offer.rarity);
    g.fillText(
      `${offer.def.wild ? 'WILDCARD  ·  ' : ''}${offer.def.school.toUpperCase()}  ·  ${archetype}  ·  ${SLOT_LABEL[offer.def.slot]}`,
      r.x + r.w / 2,
      r.y + 108,
    );

    // name
    g.font = '800 23px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(offer.def.name, r.x + r.w / 2, r.y + 140);

    // rarity
    g.font = '700 13px system-ui, sans-serif';
    g.fillStyle = rarityColor;
    g.fillText(
      (offer.def.wild ? 'ONE OF A KIND · ' : '') + offer.rarity.toUpperCase(),
      r.x + r.w / 2,
      r.y + 168,
    );

    // description
    g.font = '500 15px system-ui, sans-serif';
    g.fillStyle = 'rgba(225, 228, 250, 0.9)';
    const lines = wrapText(g, offer.def.describe(RARITY_MULT[offer.rarity]), r.w - 44);
    lines.forEach((line, li) => {
      g.fillText(line, r.x + r.w / 2, r.y + 210 + li * 22);
    });

    if (hover) {
      g.font = '600 13px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText('CLICK TO TAKE', r.x + r.w / 2, r.y + r.h - 26);
    }

    g.restore();
  }
}
