import type { Vec } from './vec';

/**
 * Global keyboard/mouse state with per-frame edge detection.
 * Mouse position is in canvas CSS pixels; scenes convert to world space.
 */
export class Input {
  private keys = new Set<string>();
  private keysPressed = new Set<string>();
  private mouseButtons = new Set<number>();
  private mousePressed = new Set<number>();

  readonly mouse: Vec = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.keysPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons.add(e.button);
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  isMouseDown(button = 0): boolean {
    return this.mouseButtons.has(button);
  }

  /** True only on the frame the button went down. */
  wasClicked(button = 0): boolean {
    return this.mousePressed.has(button);
  }

  /** Call once at the end of every frame to reset edge states. */
  endFrame(): void {
    this.keysPressed.clear();
    this.mousePressed.clear();
  }
}
