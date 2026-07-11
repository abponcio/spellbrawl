import type { ArenaScene } from '../scenes/arena';
import { ROUNDS_TO_WIN, SCHOOL_COLORS, STOCKS_PER_ROUND } from '../game/constants';
import { boonArchetypeLabel } from '../game/skills';
import { RARITY_COLORS, RARITY_MULT, type OwnedBoon, type Slot } from '../game/types';
import type { Wizard } from '../game/wizard';
import { drawSigil } from './sigil';
import { roundedRect, wrapText } from './text';

function pressureColor(p: number): string {
  if (p < 40) return '#ffffff';
  if (p < 80) return '#ffe94d';
  if (p < 130) return '#ff9f43';
  return '#ff4d4d';
}

export function drawHud(g: CanvasRenderingContext2D, arena: ArenaScene): void {
  const { viewport, match } = arena.ctx;
  if (!match) return;
  const W = viewport.width;
  const H = viewport.height;

  // ---- round header ----
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.font = '600 15px system-ui, sans-serif';
  g.fillStyle = 'rgba(220, 225, 255, 0.75)';
  g.fillText(`ROUND ${match.round}  ·  first to ${ROUNDS_TO_WIN} wins`, W / 2, 14);

  // round-win pips per fighter
  const pipY = 38;
  const totalW = match.fighters.length * 90;
  match.fighters.forEach((f, i) => {
    const cx = W / 2 - totalW / 2 + i * 90 + 45;
    for (let k = 0; k < ROUNDS_TO_WIN; k++) {
      g.beginPath();
      g.arc(cx - (ROUNDS_TO_WIN - 1) * 7 + k * 14, pipY, 4.5, 0, Math.PI * 2);
      g.fillStyle = k < f.roundWins ? f.color : 'rgba(255,255,255,0.15)';
      g.fill();
    }
  });

  // ---- Smash-style percent badges along the bottom ----
  const badgeW = 148;
  const gap = 18;
  const n = arena.wizards.length;
  const startX = W / 2 - (n * badgeW + (n - 1) * gap) / 2;
  const badgeY = H - 96;
  arena.wizards.forEach((w, i) => {
    drawBadge(g, w, startX + i * (badgeW + gap), badgeY, badgeW);
  });

  // ---- player skill bar + boon chips (bottom-left) ----
  const player = arena.wizards.find((w) => w.isPlayer);
  if (player) {
    drawSkillBar(g, player, 20, H - 118);
    drawBoonChips(g, arena, player, 20, H - 118);
  }

  // ---- center messages ----
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (arena.phase === 'countdown') {
    const sec = Math.ceil(arena.phaseTimer);
    g.font = '800 110px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.shadowColor = '#7080ff';
    g.shadowBlur = 30;
    g.fillText(sec > 0 ? String(sec) : 'FIGHT!', W / 2, H * 0.38);
    g.shadowBlur = 0;

    // announce what everyone drafted before the fight starts
    let annY = H * 0.38 + 92;
    if (match.lastPlayerPick) {
      const b = match.lastPlayerPick;
      g.font = '700 19px system-ui, sans-serif';
      g.fillStyle = SCHOOL_COLORS[b.def.school];
      g.fillText(`NEW BOON — ${b.def.name}  (${b.rarity.toUpperCase()})`, W / 2, annY);
      annY += 30;
    }
    g.font = '600 15px system-ui, sans-serif';
    for (const pick of match.lastAiPicks) {
      g.fillStyle = pick.fighter.color;
      g.fillText(`${pick.fighter.name}: ${pick.boon.def.name}`, W / 2, annY);
      annY += 24;
    }
  } else if (arena.phase === 'fight' && arena.fightTime < 1) {
    g.font = '800 90px system-ui, sans-serif';
    g.globalAlpha = 1 - arena.fightTime;
    g.fillStyle = '#ffe94d';
    g.shadowColor = '#ff9f43';
    g.shadowBlur = 30;
    g.fillText('FIGHT!', W / 2, H * 0.38);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  } else if (arena.phase === 'end') {
    g.font = '800 54px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.shadowColor = arena.roundWinner?.color ?? '#7080ff';
    g.shadowBlur = 26;
    g.fillText(arena.banner, W / 2, H * 0.38);
    g.shadowBlur = 0;
  }
}

function drawBadge(
  g: CanvasRenderingContext2D,
  w: Wizard,
  x: number,
  y: number,
  width: number,
): void {
  const h = 62;
  g.globalAlpha = w.state === 'out' ? 0.35 : 1;

  g.fillStyle = 'rgba(12, 12, 28, 0.82)';
  roundedRect(g, x, y, width, h, 10);
  g.fill();
  g.strokeStyle = w.color;
  g.lineWidth = 2;
  roundedRect(g, x, y, width, h, 10);
  g.stroke();

  // name
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.font = '700 13px system-ui, sans-serif';
  g.fillStyle = w.color;
  g.fillText(w.name.toUpperCase(), x + 12, y + 9);

  // stocks
  for (let k = 0; k < STOCKS_PER_ROUND; k++) {
    g.beginPath();
    g.arc(x + width - 16 - k * 15, y + 16, 5, 0, Math.PI * 2);
    g.fillStyle = k < w.stocks ? w.color : 'rgba(255,255,255,0.14)';
    g.fill();
  }

  // pressure %
  const p = Math.round(w.pressure);
  g.font = '800 27px system-ui, sans-serif';
  g.fillStyle = w.state === 'out' ? 'rgba(255,255,255,0.4)' : pressureColor(p);
  if (p >= 100) {
    g.shadowColor = '#ff4d4d';
    g.shadowBlur = 12;
  }
  g.fillText(w.state === 'out' ? 'OUT' : `${p}%`, x + 12, y + 27);
  g.shadowBlur = 0;
  g.globalAlpha = 1;
}

const SLOT_ORDER: Slot[] = ['attack', 'shield', 'movement'];

/**
 * School-sigil chips stacked above the skill square each boon modifies.
 * Hovering a chip shows its name and full description.
 */
function drawBoonChips(
  g: CanvasRenderingContext2D,
  arena: ArenaScene,
  w: Wizard,
  barX: number,
  barY: number,
): void {
  const mouse = arena.ctx.input.mouse;
  const chipR = 11;
  const chipGap = 26;
  let hovered: OwnedBoon | null = null;
  let hoverPos = { x: 0, y: 0 };

  SLOT_ORDER.forEach((slot, si) => {
    const boons = w.boons.filter((b) => b.def.slot === slot);
    const cx = barX + si * 62 + 26; // centered over each 52px skill square
    boons.forEach((b, bi) => {
      const cy = barY - 22 - bi * chipGap;

      // rarity ring (wildcards get an animated iridescent ring)
      g.beginPath();
      g.arc(cx, cy, chipR, 0, Math.PI * 2);
      g.fillStyle = 'rgba(12, 12, 28, 0.9)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = b.def.wild
        ? `hsl(${(arena.time * 130 + bi * 60) % 360}, 85%, 65%)`
        : RARITY_COLORS[b.rarity];
      g.stroke();

      drawSigil(g, b.def.school, cx, cy, chipR * 1.6);

      const dx = mouse.x - cx;
      const dy = mouse.y - cy;
      if (dx * dx + dy * dy < (chipR + 4) * (chipR + 4)) {
        hovered = b;
        hoverPos = { x: cx, y: cy };
      }
    });
  });

  if (hovered) {
    const b: OwnedBoon = hovered;
    g.font = '500 13px system-ui, sans-serif';
    const desc = b.def.describe(RARITY_MULT[b.rarity]);
    const lines = wrapText(g, desc, 240);
    const boxW = 264;
    const boxH = 46 + lines.length * 17;
    const bx = Math.min(hoverPos.x + 18, arena.ctx.viewport.width - boxW - 10);
    const by = hoverPos.y - boxH - 8;

    g.fillStyle = 'rgba(10, 11, 26, 0.95)';
    roundedRect(g, bx, by, boxW, boxH, 8);
    g.fill();
    g.strokeStyle = SCHOOL_COLORS[b.def.school];
    g.lineWidth = 1.5;
    roundedRect(g, bx, by, boxW, boxH, 8);
    g.stroke();

    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = '700 14px system-ui, sans-serif';
    g.fillStyle = SCHOOL_COLORS[b.def.school];
    g.fillText(b.def.name, bx + 12, by + 10);
    g.font = '600 11px system-ui, sans-serif';
    g.fillStyle = b.def.wild ? '#ffd9ff' : RARITY_COLORS[b.rarity];
    g.fillText(
      `${b.def.wild ? 'WILDCARD · ' : ''}${b.rarity.toUpperCase()} · ${boonArchetypeLabel(b.def, b.rarity)}`,
      bx + 12,
      by + 27,
    );
    g.font = '500 13px system-ui, sans-serif';
    g.fillStyle = 'rgba(228, 231, 250, 0.92)';
    lines.forEach((line, li) => g.fillText(line, bx + 12, by + 44 + li * 17));
  }
}

function drawSkillBar(g: CanvasRenderingContext2D, w: Wizard, x: number, y: number): void {
  const slots: { label: string; key: string; ready: number; active: boolean }[] = [
    {
      label: 'ATK',
      key: 'LMB',
      ready: w.attackCd <= 0 ? 1 : 1 - w.attackCd / 1.2,
      active: false,
    },
    {
      label: 'SHD',
      key: 'RMB',
      ready: w.shieldBroken ? 0 : w.stamina,
      active: w.shieldUp,
    },
    {
      label: w.mods.enemySwap > 0 ? 'SWP' : w.mods.blink > 0 ? 'BLK' : 'DSH',
      key: 'SPC',
      ready: w.dashCd <= 0 ? 1 : 1 - w.dashCd / 3,
      active: w.isDashing,
    },
  ];

  slots.forEach((s, i) => {
    const sx = x + i * 62;
    const size = 52;
    g.fillStyle = 'rgba(12, 12, 28, 0.82)';
    roundedRect(g, sx, y, size, size, 8);
    g.fill();

    // fill meter from bottom
    const f = Math.max(0, Math.min(1, s.ready));
    if (f > 0) {
      g.save();
      roundedRect(g, sx, y, size, size, 8);
      g.clip();
      g.fillStyle = s.active
        ? 'rgba(140, 220, 255, 0.55)'
        : f >= 1
          ? 'rgba(110, 190, 140, 0.45)'
          : 'rgba(255, 255, 255, 0.16)';
      g.fillRect(sx, y + size * (1 - f), size, size * f);
      g.restore();
    }

    g.strokeStyle = f >= 1 ? 'rgba(150, 255, 190, 0.8)' : 'rgba(255,255,255,0.25)';
    g.lineWidth = 1.5;
    roundedRect(g, sx, y, size, size, 8);
    g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 13px system-ui, sans-serif';
    g.fillStyle = '#e8ecff';
    g.fillText(s.label, sx + size / 2, y + size / 2 - 6);
    g.font = '500 10px system-ui, sans-serif';
    g.fillStyle = 'rgba(220,225,255,0.55)';
    g.fillText(s.key, sx + size / 2, y + size / 2 + 11);
  });
}
