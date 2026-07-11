import type { Vec } from './vec';

/**
 * Maps a fixed logical world view (centered at origin) onto the full-window canvas.
 * Handles devicePixelRatio and screen shake offset.
 */
export class Viewport {
  width = 0; // CSS pixels
  height = 0;
  scale = 1;
  shake: Vec = { x: 0, y: 0 };

  constructor(
    readonly canvas: HTMLCanvasElement,
    /** Diameter of the world region that must always fit on screen. */
    private worldView = 1440,
  ) {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Dynamic camera zoom: change the visible world diameter (smoothed by callers). */
  setWorldView(diameter: number): void {
    if (Math.abs(diameter - this.worldView) < 0.5) return;
    this.worldView = diameter;
    this.scale = Math.min(this.width, this.height) / this.worldView;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scale = Math.min(this.width, this.height) / this.worldView;
  }

  /** Apply world-space transform (call inside ctx.save/restore). */
  applyWorld(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.width / 2 + this.shake.x, this.height / 2 + this.shake.y);
    ctx.scale(this.scale, this.scale);
  }

  screenToWorld(p: Vec): Vec {
    return {
      x: (p.x - this.width / 2 - this.shake.x) / this.scale,
      y: (p.y - this.height / 2 - this.shake.y) / this.scale,
    };
  }
}
