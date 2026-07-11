import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import { SCHOOL_COLORS } from '../game/constants';
import { RARITY_COLORS } from '../game/types';
import { roundedRect } from '../ui/text';
import { persistSoloMatch } from '../net/sync';

export class ResultsScene implements Scene {
  private time = 0;

  constructor(private ctx: GameCtx) {}

  private persisted = false;

  enter(): void {
    this.time = 0;
    if (!this.persisted) {
      this.persisted = true;
      const match = this.ctx.match!;
      const ps = match.statsTracker.get(match.player.id);
      void persistSoloMatch(match, ps);
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time > 0.8 && this.ctx.input.wasClicked(0)) {
      this.ctx.toMenu();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const { viewport } = this.ctx;
    const match = this.ctx.match!;
    const winner = match.winner!;
    const W = viewport.width;
    const H = viewport.height;
    const ps = match.statsTracker.get(match.player.id);

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    const playerWon = winner.isPlayer;
    g.font = '800 72px system-ui, sans-serif';
    g.fillStyle = playerWon ? '#ffe94d' : '#ff5964';
    g.shadowColor = winner.color;
    g.shadowBlur = 40;
    g.fillText(playerWon ? 'VICTORY' : 'DEFEAT', W / 2, H * 0.14);
    g.shadowBlur = 0;

    g.font = '500 18px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.85)';
    g.fillText(
      playerWon
        ? `You claimed ${winner.roundWins} rounds and the arena.`
        : `${winner.name} claimed the arena. The fall was long.`,
      W / 2,
      H * 0.21,
    );

    // match stats card
    g.font = '700 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.7)';
    g.fillText('YOUR MATCH STATS', W / 2, H * 0.3);

    const statLines = [
      `Damage dealt: ${Math.round(ps.damageDealt)}%`,
      `Damage taken: ${Math.round(ps.damageTaken)}%`,
      `Blocks: ${ps.blocks}  ·  Parries: ${ps.parries}`,
      `KOs: ${ps.kos}  ·  Deaths: ${ps.deaths}`,
      `Distance: ${(ps.distanceM / 1000).toFixed(2)} km`,
      `Peak pressure: ${Math.round(ps.peakPressure)}%`,
    ];
    const cardW = 420;
    const cardH = statLines.length * 26 + 24;
    const cardY = H * 0.34;
    g.fillStyle = 'rgba(16, 17, 36, 0.92)';
    roundedRect(g, W / 2 - cardW / 2, cardY, cardW, cardH, 10);
    g.fill();
    g.font = '600 15px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.9)';
    statLines.forEach((line, i) => {
      g.fillText(line, W / 2, cardY + 22 + i * 26);
    });

    const boons = match.player.boons;
    g.font = '700 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.6)';
    g.fillText('YOUR FINAL BUILD', W / 2, H * 0.58);

    if (boons.length === 0) {
      g.font = '500 14px system-ui, sans-serif';
      g.fillText('(no boons — a pure wizard)', W / 2, H * 0.62);
    } else {
      const rowH = 28;
      const listW = 400;
      boons.slice(0, 4).forEach((b, i) => {
        const y = H * 0.62 + i * rowH;
        g.fillStyle = 'rgba(16, 17, 36, 0.9)';
        roundedRect(g, W / 2 - listW / 2, y - 12, listW, 24, 6);
        g.fill();
        g.textAlign = 'left';
        g.font = '700 13px system-ui, sans-serif';
        g.fillStyle = SCHOOL_COLORS[b.def.school];
        g.fillText(b.def.name, W / 2 - listW / 2 + 12, y);
        g.textAlign = 'right';
        g.font = '600 11px system-ui, sans-serif';
        g.fillStyle = RARITY_COLORS[b.rarity];
        g.fillText(b.rarity.toUpperCase(), W / 2 + listW / 2 - 12, y);
        g.textAlign = 'center';
      });
    }

    if (this.time > 0.8) {
      g.font = '600 16px system-ui, sans-serif';
      g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(this.time * 3)})`;
      g.fillText('click to return to the sanctum', W / 2, H - 50);
    }
  }
}
