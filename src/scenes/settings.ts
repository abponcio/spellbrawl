import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import { loadSettings, saveSettings, type AIDifficulty } from '../game/settings';
import { pushCloudSettings } from '../net/sync';
import { roundedRect } from '../ui/text';

const DIFFICULTIES: { id: AIDifficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export class SettingsScene implements Scene {
  private settings = loadSettings();

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.settings = loadSettings();
  }

  update(_dt: number): void {
    const { input } = this.ctx;
    if (input.wasClicked(0)) {
      const W = this.ctx.viewport.width;
      const H = this.ctx.viewport.height;
      const cx = W / 2;
      const bw = 280;
      const bx = cx - bw / 2;

      // back
      if (input.mouse.y >= H - 90 && input.mouse.y <= H - 50) {
        this.ctx.toMenu();
        return;
      }

      // difficulty buttons
      const diffY = H * 0.48;
      DIFFICULTIES.forEach((d, i) => {
        const x = bx + i * (bw / 3 + 8);
        const w = bw / 3 - 8;
        if (
          input.mouse.x >= x &&
          input.mouse.x <= x + w &&
          input.mouse.y >= diffY &&
          input.mouse.y <= diffY + 44
        ) {
          this.settings.aiDifficulty = d.id;
          saveSettings(this.settings);
          void pushCloudSettings(this.settings);
        }
      });

      // screen shake toggle
      if (
        input.mouse.x >= bx &&
        input.mouse.x <= bx + bw &&
        input.mouse.y >= H * 0.58 &&
        input.mouse.y <= H * 0.58 + 40
      ) {
        this.settings.screenShake = !this.settings.screenShake;
        saveSettings(this.settings);
        void pushCloudSettings(this.settings);
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
    g.textBaseline = 'middle';
    g.font = '800 48px system-ui, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText('SETTINGS', W / 2, H * 0.18);

    g.font = '700 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText('AI DIFFICULTY (solo modes)', W / 2, H * 0.38);

    const bw = 280;
    const bx = W / 2 - bw / 2;
    const diffY = H * 0.48;
    DIFFICULTIES.forEach((d, i) => {
      const x = bx + i * (bw / 3 + 8);
      const w = bw / 3 - 8;
      const sel = this.settings.aiDifficulty === d.id;
      g.fillStyle = sel ? 'rgba(80, 90, 200, 0.45)' : 'rgba(20, 22, 48, 0.85)';
      roundedRect(g, x, diffY, w, 44, 8);
      g.fill();
      g.strokeStyle = sel ? '#9fadff' : 'rgba(130, 140, 255, 0.35)';
      g.lineWidth = sel ? 2.5 : 1.5;
      roundedRect(g, x, diffY, w, 44, 8);
      g.stroke();
      g.font = '700 15px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(d.label, x + w / 2, diffY + 22);
    });

    g.textAlign = 'left';
    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.9)';
    g.fillText(`Screen shake: ${this.settings.screenShake ? 'ON' : 'OFF'}`, bx + 16, H * 0.58 + 20);
    g.strokeStyle = 'rgba(130, 140, 255, 0.35)';
    roundedRect(g, bx, H * 0.58, bw, 40, 8);
    g.stroke();

    g.textAlign = 'center';
    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.65)';
    g.fillText('click BACK to return', W / 2, H - 70);
    g.fillStyle = 'rgba(130, 140, 255, 0.9)';
    g.fillText('BACK', W / 2, H - 50);
  }
}
