import { preloadAssets } from './engine/assets';
import { sfx } from './engine/audio';
import { Input } from './engine/input';
import { SceneManager } from './engine/scene';
import { Viewport } from './engine/viewport';
import { WORLD_VIEW } from './game/constants';
import type { GameCtx } from './game/context';
import { Match } from './game/match';
import { ArenaScene } from './scenes/arena';
import { DraftScene } from './scenes/draft';
import { LobbyScene } from './scenes/lobby';
import { MenuScene } from './scenes/menu';
import { ResultsScene } from './scenes/results';
import { SettingsScene } from './scenes/settings';
import { bootstrapCloud } from './net/sync';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx2d = canvas.getContext('2d')!;

preloadAssets([
  'arena-disc',
  'nebula',
  'title',
  'sigil-ember',
  'sigil-frost',
  'sigil-volt',
  'sigil-gale',
  'sigil-void',
  'sigil-arcane',
]);
preloadAssets(['wizard-cyan', 'wizard-red', 'wizard-orange', 'wizard-purple'], {
  chromaKey: true,
});

class Game implements GameCtx {
  viewport = new Viewport(canvas, WORLD_VIEW);
  input = new Input(canvas);
  match: Match | null = null;

  private scenes = new SceneManager();
  private menu = new MenuScene(this);
  private draft = new DraftScene(this);
  private arena = new ArenaScene(this);
  private results = new ResultsScene(this);
  private settings = new SettingsScene(this);
  private lobby = new LobbyScene(this);

  constructor() {
    this.scenes.set(this.menu);
    canvas.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
    void bootstrapCloud();
    this.parseJoinRoute();
    this.loop();
  }

  /** /join/SPELL42 opens the lobby with code prefilled. */
  private parseJoinRoute(): void {
    const m = location.pathname.match(/^\/join\/([A-Za-z0-9]{4,8})\/?$/);
    if (m) {
      this.scenes.set(this.lobby);
      this.lobby.mode = 'join';
      this.lobby.joinInput = m[1].toUpperCase().slice(0, 6);
    }
  }

  startMatch(enemyCount: number): void {
    this.match = new Match(enemyCount);
    this.startDraft();
  }

  startDraft(): void {
    this.scenes.set(this.draft);
  }

  startRound(): void {
    this.scenes.set(this.arena);
  }

  endMatch(): void {
    this.scenes.set(this.results);
  }

  toMenu(): void {
    this.match = null;
    history.replaceState(null, '', '/');
    this.scenes.set(this.menu);
  }

  toSettings(): void {
    this.scenes.set(this.settings);
  }

  toLobby(): void {
    this.scenes.set(this.lobby);
  }

  private last = performance.now();

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    this.scenes.update(dt);
    this.scenes.render(ctx2d);
    this.input.endFrame();

    requestAnimationFrame(this.loop);
  };
}

new Game();
