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

const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_';

export class SettingsScene implements Scene {
  private settings = loadSettings();
  private editingName = false;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.settings = loadSettings();
    this.editingName = false;
  }

  update(_dt: number): void {
    const { input } = this.ctx;
    if (input.wasClicked(0)) {
      const W = this.ctx.viewport.width;
      const H = this.ctx.viewport.height;
      const cx = W / 2;
      const bw = 280;
      const bx = cx - bw / 2;

      if (input.mouse.y >= H - 90 && input.mouse.y <= H - 50) {
        this.ctx.toMenu();
        return;
      }

      if (this.editingName) {
        for (let i = 0; i < NAME_CHARS.length; i++) {
          const col = i % 13;
          const row = Math.floor(i / 13);
          const kx = bx + col * 24;
          const ky = H * 0.52 + row * 30;
          if (
            input.mouse.x >= kx &&
            input.mouse.x <= kx + 22 &&
            input.mouse.y >= ky &&
            input.mouse.y <= ky + 26 &&
            this.settings.displayName.length < 16
          ) {
            this.settings.displayName += NAME_CHARS[i];
          }
        }
        if (
          input.mouse.x >= bx + bw - 60 &&
          input.mouse.x <= bx + bw - 10 &&
          input.mouse.y >= H * 0.36 &&
          input.mouse.y <= H * 0.36 + 32 &&
          this.settings.displayName.length > 0
        ) {
          this.settings.displayName = this.settings.displayName.slice(0, -1);
        }
        if (input.mouse.x >= bx && input.mouse.x <= bx + bw && input.mouse.y >= H * 0.72 && input.mouse.y <= H * 0.72 + 44) {
          this.editingName = false;
          saveSettings(this.settings);
          void pushCloudSettings(this.settings);
        }
        return;
      }

      if (
        input.mouse.x >= bx &&
        input.mouse.x <= bx + bw &&
        input.mouse.y >= H * 0.3 &&
        input.mouse.y <= H * 0.3 + 40
      ) {
        this.editingName = true;
        return;
      }

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
    g.fillText('SETTINGS', W / 2, H * 0.14);

    const bw = 280;
    const bx = W / 2 - bw / 2;

    if (this.editingName) {
      g.font = '600 16px system-ui, sans-serif';
      g.fillStyle = 'rgba(200, 205, 245, 0.8)';
      g.fillText('EDIT DISPLAY NAME', W / 2, H * 0.28);
      g.font = '800 32px system-ui, sans-serif';
      g.fillStyle = '#9fe8ff';
      g.fillText(this.settings.displayName || '_', W / 2, H * 0.36);
      g.font = '600 16px system-ui, sans-serif';
      g.fillStyle = 'rgba(130, 140, 255, 0.9)';
      g.fillText('DONE', W / 2, H * 0.72 + 22);
      return;
    }

    g.textAlign = 'left';
    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.9)';
    g.fillText(`Display name: ${this.settings.displayName}`, bx + 16, H * 0.3 + 20);
    g.strokeStyle = 'rgba(130, 140, 255, 0.35)';
    roundedRect(g, bx, H * 0.3, bw, 40, 8);
    g.stroke();

    g.textAlign = 'center';
    g.font = '700 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(200, 205, 245, 0.75)';
    g.fillText('AI DIFFICULTY (solo modes)', W / 2, H * 0.38);

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
