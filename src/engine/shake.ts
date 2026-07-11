import { rand } from './rng';
import type { Vec } from './vec';

/** Decaying screen shake producing a per-frame pixel offset. */
export class ScreenShake {
  private intensity = 0;

  add(amount: number): void {
    this.intensity = Math.min(30, this.intensity + amount);
  }

  update(dt: number, out: Vec): void {
    this.intensity = Math.max(0, this.intensity - 40 * dt * (1 + this.intensity * 0.1));
    if (this.intensity > 0.1) {
      out.x = rand(-this.intensity, this.intensity);
      out.y = rand(-this.intensity, this.intensity);
    } else {
      out.x = 0;
      out.y = 0;
    }
  }
}
