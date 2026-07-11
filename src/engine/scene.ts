export interface Scene {
  /** Called when the scene becomes active. */
  enter?(): void;
  /** Called when leaving this scene. */
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

export class SceneManager {
  private current: Scene | null = null;

  set(scene: Scene): void {
    this.current?.exit?.();
    this.current = scene;
    scene.enter?.();
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.current?.render(ctx);
  }
}
