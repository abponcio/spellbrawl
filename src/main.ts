import { preloadAssets } from './engine/assets';
import { sfx } from './engine/audio';
import { Input } from './engine/input';
import { SceneManager } from './engine/scene';
import { Viewport } from './engine/viewport';
import { WORLD_VIEW } from './game/constants';
import type { GameCtx } from './game/context';
import { Match } from './game/match';
import { partyClient, type ServerMessage } from './net/party';
import { persistOnlineMatch } from './net/profile';
import { bootstrapCloud } from './net/sync';
import { AccountScene } from './scenes/account';
import { ArenaScene } from './scenes/arena';
import { DraftScene } from './scenes/draft';
import { LobbyScene } from './scenes/lobby';
import { MenuScene } from './scenes/menu';
import { OnlineArenaScene } from './scenes/online-arena';
import { OnlineDraftScene } from './scenes/online-draft';
import { ResultsScene } from './scenes/results';
import { SettingsScene } from './scenes/settings';

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
void sfx.preload();

class Game implements GameCtx {
  viewport = new Viewport(canvas, WORLD_VIEW);
  input = new Input(canvas);
  match: Match | null = null;
  party = partyClient;

  private scenes = new SceneManager();
  private menu = new MenuScene(this);
  private draft = new DraftScene(this);
  private arena = new ArenaScene(this);
  private onlineDraft = new OnlineDraftScene(this);
  private onlineArena = new OnlineArenaScene(this);
  private results = new ResultsScene(this);
  private settings = new SettingsScene(this);
  private lobby = new LobbyScene(this);
  private account = new AccountScene(this);

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
    partyClient.disconnect();
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

  endOnlineMatch(msg: Extract<ServerMessage, { t: 'match_end' }>): void {
    const standings = msg.standings.sort((a, b) => b.roundWins - a.roundWins);
    this.match = Match.forOnline(
      standings.map((s) => ({ name: s.name, color: s.color, roundWins: s.roundWins })),
      partyClient.mySlot,
    );
    if (msg.winnerId !== null) {
      const winner = this.match.fighters.find((f) => f.id === msg.winnerId) ?? null;
      this.match.winner = winner;
    }
    const ps = this.match.statsTracker.get(this.match.player.id);
    const placement =
      standings.findIndex((s) => s.id === partyClient.mySlot) + 1 || standings.length;
    void persistOnlineMatch(this.match, ps, partyClient.code, placement);
    partyClient.leaveMatch();
    this.endMatch();
  }

  startOnlineDraft(): void {
    this.scenes.set(this.onlineDraft);
  }

  startOnlineArena(): void {
    this.match = Match.forOnline(
      partyClient.players.map((p) => ({ name: p.name, color: p.color })),
      partyClient.mySlot,
    );
    this.scenes.set(this.onlineArena);
  }

  toMenu(): void {
    partyClient.disconnect();
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

  toAccount(): void {
    this.scenes.set(this.account);
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
