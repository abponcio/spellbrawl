import { getAsset } from '../engine/assets';
import { sfx } from '../engine/audio';
import { ParticleSystem } from '../engine/particles';
import type { Scene } from '../engine/scene';
import { ScreenShake } from '../engine/shake';
import { ARENA_RADIUS, SUDDEN_DEATH_START, WIZARD_RADIUS, WORLD_VIEW } from '../game/constants';
import type { GameCtx } from '../game/context';
import { renderHazard } from '../game/hazards';
import type { SimSnapshot } from '../game/sim/types';
import { partyClient } from '../net/party';
import { roundedRect } from '../ui/text';

export class OnlineArenaScene implements Scene {
  snap: SimSnapshot | null = null;
  prevSnap: SimSnapshot | null = null;
  lerpT = 0;
  time = 0;
  particles = new ParticleSystem();
  shake = new ScreenShake();
  private camView = WORLD_VIEW;
  private lastCountdownSecond = 4;

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.snap = partyClient.latestSnap;
    this.prevSnap = null;
    this.time = 0;
    this.camView = (ARENA_RADIUS + 110) * 2;
    this.ctx.viewport.setWorldView(this.camView);
    this.lastCountdownSecond = 4;
  }

  exit(): void {
    /* coordinator owns party routing */
  }

  update(dt: number): void {
    this.time += dt;
    this.lerpT = Math.min(1, this.lerpT + dt * 10);
    this.particles.update(dt);
    this.shake.update(dt, this.ctx.viewport.shake);

    if (partyClient.latestSnap) {
      if (this.snap !== partyClient.latestSnap) {
        this.prevSnap = this.snap;
        this.snap = partyClient.latestSnap;
        this.lerpT = 0;
      }
    }

    const { input } = this.ctx;
    if (input.wasClicked(0)) {
      const W = this.ctx.viewport.width;
      const H = this.ctx.viewport.height;
      const leaveX = W - 110;
      const leaveY = H - 44;
      if (
        input.mouse.x >= leaveX &&
        input.mouse.x <= leaveX + 90 &&
        input.mouse.y >= leaveY &&
        input.mouse.y <= leaveY + 32
      ) {
        partyClient.leaveMatch();
        this.ctx.toLobby();
        return;
      }
    }

    const snap = this.snap;
    if (!snap || partyClient.mySlot < 0) return;

    if (snap.phase === 'countdown') {
      const sec = Math.ceil(snap.phaseTimer);
      if (sec < this.lastCountdownSecond && sec > 0) {
        this.lastCountdownSecond = sec;
        sfx.countdown();
      }
      if (snap.phaseTimer <= 0.1) sfx.fight();
    }

    const { viewport } = this.ctx;
    const aim = viewport.screenToWorld(input.mouse);
    partyClient.sendInput({
      moveX: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      moveY: (input.isDown('KeyS') ? 1 : 0) - (input.isDown('KeyW') ? 1 : 0),
      aimX: aim.x,
      aimY: aim.y,
      attack: input.isMouseDown(0),
      shield: input.isMouseDown(2),
      dash:
        input.wasPressed('Space') ||
        input.wasPressed('ShiftLeft') ||
        input.wasPressed('ShiftRight'),
    });

    let need = snap.arenaRadius + 110;
    for (const w of snap.wizards) {
      if (w.state === 'out') continue;
      const d = Math.hypot(w.x, w.y);
      if (d + 130 > need) need = Math.min(d + 130, snap.blastRadius + 110);
    }
    const target = need * 2;
    this.camView += (target - this.camView) * Math.min(dt * 2.5, 1);
    this.ctx.viewport.setWorldView(this.camView);
  }

  private lerpWizard(id: number) {
    const cur = this.snap?.wizards.find((w) => w.id === id);
    if (!cur) return null;
    const prev = this.prevSnap?.wizards.find((w) => w.id === id);
    if (!prev || this.lerpT >= 1) return cur;
    const t = this.lerpT;
    return {
      ...cur,
      x: prev.x + (cur.x - prev.x) * t,
      y: prev.y + (cur.y - prev.y) * t,
    };
  }

  render(g: CanvasRenderingContext2D): void {
    const { viewport } = this.ctx;
    const W = viewport.width;
    const H = viewport.height;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    const snap = this.snap;
    if (!snap) {
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.font = '600 18px system-ui, sans-serif';
      g.fillText('Connecting to arena…', W / 2, H / 2);
      this.renderHudChrome(g, W, H);
      return;
    }

    g.save();
    viewport.applyWorld(g);

    const nebula = getAsset('nebula');
    if (nebula) {
      g.globalAlpha = 0.5;
      g.drawImage(nebula, -1960, -1960, 3920, 3920);
      g.globalAlpha = 1;
    }

    const disc = getAsset('arena-disc');
    const r = snap.arenaRadius;
    if (disc) {
      const sz = r * 2.15;
      g.drawImage(disc, -sz / 2, -sz / 2, sz, sz);
    } else {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, '#2a2d5a');
      grad.addColorStop(1, '#12132a');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
    }

    g.strokeStyle = 'rgba(178, 130, 255, 0.2)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, snap.blastRadius, 0, Math.PI * 2);
    g.stroke();

    for (const h of snap.hazards) {
      renderHazard(
        g,
        {
          kind: h.kind,
          pos: { x: h.x, y: h.y },
          radius: h.radius,
          ttl: h.ttl,
          maxTtl: h.maxTtl,
          owner: { id: 0 } as never,
          value: 0,
        },
        this.time,
      );
    }

    for (const p of snap.projectiles) {
      const a = Math.atan2(p.vy, p.vx);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(a);
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 16;
      g.beginPath();
      g.ellipse(0, 0, p.radius * 2.2, p.radius, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    for (const w of snap.wizards) {
      const lw = this.lerpWizard(w.id) ?? w;
      if (w.state === 'out') continue;

      if (w.shieldUp) {
        g.strokeStyle = 'rgba(140, 220, 255, 0.55)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(lw.x, lw.y, WIZARD_RADIUS + 14, 0, Math.PI * 2);
        g.stroke();
      }

      const sprite = getAsset(
        ['wizard-cyan', 'wizard-red', 'wizard-orange', 'wizard-purple'][w.id] ?? 'wizard-cyan',
      );
      if (sprite) {
        const sz = WIZARD_RADIUS * 3.2;
        g.drawImage(sprite, lw.x - sz / 2, lw.y - sz / 2, sz, sz);
      } else {
        g.fillStyle = w.color;
        g.beginPath();
        g.arc(lw.x, lw.y, WIZARD_RADIUS, 0, Math.PI * 2);
        g.fill();
      }

      g.font = '700 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText(w.name, lw.x, lw.y - WIZARD_RADIUS - 12);

      const barW = 44;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(lw.x - barW / 2, lw.y + WIZARD_RADIUS + 6, barW, 6);
      g.fillStyle = w.pressure > 100 ? '#ff5964' : '#9fe8ff';
      g.fillRect(lw.x - barW / 2, lw.y + WIZARD_RADIUS + 6, barW * Math.min(1, w.pressure / 150), 6);
    }

    this.particles.render(g);
    g.restore();

    const me = snap.wizards.find((w) => w.id === partyClient.mySlot);
    g.textAlign = 'left';
    g.font = '700 16px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(`Round ${snap.round}`, 24, 36);
    if (me) {
      g.fillText(`Pressure: ${Math.round(me.pressure)}%`, 24, 60);
      g.fillText(`Stocks: ${me.stocks}`, 24, 84);
    }

    if (snap.phase === 'countdown') {
      g.textAlign = 'center';
      g.font = '800 72px system-ui, sans-serif';
      g.fillStyle = '#ffe94d';
      g.fillText(String(Math.ceil(snap.phaseTimer)), W / 2, H * 0.38);
    }

    if (snap.phase === 'fight' && snap.fightTime > SUDDEN_DEATH_START) {
      g.textAlign = 'center';
      g.font = '800 22px system-ui, sans-serif';
      g.fillStyle = '#ff6a5a';
      g.fillText('SUDDEN DEATH', W / 2, 80);
    }

    if (snap.phase === 'end' && snap.banner) {
      g.textAlign = 'center';
      g.font = '800 36px system-ui, sans-serif';
      g.fillStyle = '#ffe94d';
      g.fillText(snap.banner, W / 2, H * 0.2);
    }

    this.renderRoundEndOverlay(g, W, H);
    this.renderHudChrome(g, W, H);
  }

  private renderRoundEndOverlay(g: CanvasRenderingContext2D, W: number, H: number): void {
    const re = partyClient.roundEnd;
    if (!re) return;

    g.fillStyle = 'rgba(7, 7, 15, 0.55)';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 40px system-ui, sans-serif';
    g.fillStyle = '#ffe94d';
    g.fillText(re.banner, W / 2, H * 0.32);

    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.85)';
    const lines = re.roundWins
      .map((rw) => {
        const fighter = this.ctx.match?.fighters.find((f) => f.id === rw.id);
        return `${fighter?.name ?? `P${rw.id + 1}`}: ${rw.wins} round${rw.wins === 1 ? '' : 's'}`;
      })
      .join('   ·   ');
    g.fillText(lines, W / 2, H * 0.42);

    g.font = '500 14px system-ui, sans-serif';
    g.fillStyle = 'rgba(180, 190, 240, 0.6)';
    g.fillText('Next draft starting…', W / 2, H * 0.5);
  }

  private renderHudChrome(g: CanvasRenderingContext2D, W: number, H: number): void {
    g.textAlign = 'center';
    g.font = '500 13px system-ui, sans-serif';
    g.fillStyle = 'rgba(180, 190, 240, 0.5)';
    g.fillText(`Room ${partyClient.code}`, W / 2, H - 24);

    const connColors: Record<string, string> = {
      connected: '#5dffa8',
      reconnecting: '#ffe94d',
      connecting: '#ffe94d',
      disconnected: '#ff6a5a',
    };
    g.font = '600 12px system-ui, sans-serif';
    g.fillStyle = connColors[partyClient.connectionStatus] ?? '#888';
    g.fillText(partyClient.connectionStatus.toUpperCase(), W / 2, 20);

    if (partyClient.lastError) {
      g.fillStyle = '#ff6a5a';
      g.fillText(partyClient.lastError, W / 2, 38);
    }

    const leaveX = W - 110;
    const leaveY = H - 44;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(20, 22, 48, 0.9)';
    roundedRect(g, leaveX, leaveY, 90, 32, 6);
    g.fill();
    g.strokeStyle = 'rgba(255, 90, 90, 0.5)';
    roundedRect(g, leaveX, leaveY, 90, 32, 6);
    g.stroke();
    g.font = '600 13px system-ui, sans-serif';
    g.fillStyle = '#ff8a8a';
    g.fillText('LEAVE', leaveX + 45, leaveY + 16);
  }
}
