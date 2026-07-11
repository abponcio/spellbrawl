import { getAsset } from '../engine/assets';
import { SCHOOL_COLORS } from '../game/constants';
import type { School } from '../game/types';

/**
 * Draw a school sigil centered at (x, y). Uses the generated art when loaded
 * (additively blended so its dark background vanishes), otherwise a vector
 * fallback of concentric rings in the school color.
 */
export function drawSigil(
  g: CanvasRenderingContext2D,
  school: School,
  x: number,
  y: number,
  size: number,
): void {
  const img = getAsset(`sigil-${school}`);
  if (img) {
    const prevOp = g.globalCompositeOperation;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(img, x - size / 2, y - size / 2, size, size);
    g.globalCompositeOperation = prevOp;
    return;
  }
  const color = SCHOOL_COLORS[school];
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, size * 0.07);
  g.shadowColor = color;
  g.shadowBlur = size * 0.3;
  g.beginPath();
  g.arc(x, y, size * 0.4, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(x, y, size * 0.2, 0, Math.PI * 2);
  g.stroke();
  g.shadowBlur = 0;
}
