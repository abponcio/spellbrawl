/**
 * Game SFX — loads curated WAV assets from /sfx/ with synth fallback.
 */
import { loadSettings } from '../game/settings';

const SFX_FILES = {
  shot: '/sfx/shot.wav',
  hit: '/sfx/hit.wav',
  dash: '/sfx/dash.wav',
  shieldUp: '/sfx/shield.wav',
  block: '/sfx/block.wav',
  guardBreak: '/sfx/guard-break.wav',
  ringOut: '/sfx/ring-out.wav',
  draftPick: '/sfx/draft.wav',
  countdown: '/sfx/countdown.wav',
  fight: '/sfx/fight.wav',
  victory: '/sfx/victory.wav',
  defeat: '/sfx/defeat.wav',
  zap: '/sfx/zap.wav',
  burn: '/sfx/burn.wav',
} as const;

type SfxName = keyof typeof SFX_FILES;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private synth = new SynthFallback();

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyVolume();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
    this.synth.unlock();
  }

  private applyVolume(): void {
    if (!this.master) return;
    const s = loadSettings();
    this.master.gain.value = 0.35 * s.masterVolume * s.sfxVolume;
  }

  async preload(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    await Promise.all(
      (Object.entries(SFX_FILES) as [SfxName, string][]).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          this.buffers.set(name, await ctx.decodeAudioData(buf));
        } catch {
          /* use synth fallback */
        }
      }),
    );
  }

  private play(name: SfxName, vol = 1): void {
    this.applyVolume();
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const buffer = this.buffers.get(name);
    if (buffer) {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.buffer = buffer;
      src.connect(gain).connect(this.master);
      src.start();
      return;
    }
    this.synth.play(name, vol);
  }

  shot(): void {
    this.play('shot');
  }
  hit(intensity = 1): void {
    this.play('hit', Math.min(1.4, intensity));
  }
  dash(): void {
    this.play('dash');
  }
  shieldUp(): void {
    this.play('shieldUp');
  }
  block(): void {
    this.play('block');
  }
  guardBreak(): void {
    this.play('guardBreak');
  }
  ringOut(): void {
    this.play('ringOut');
  }
  draftPick(): void {
    this.play('draftPick');
  }
  countdown(): void {
    this.play('countdown');
  }
  fight(): void {
    this.play('fight');
  }
  victory(): void {
    this.play('victory');
  }
  defeat(): void {
    this.play('defeat');
  }
  zap(): void {
    this.play('zap');
  }
  burn(): void {
    this.play('burn');
  }
}

/** Original WebAudio synth — used when WAV assets are unavailable. */
class SynthFallback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass = 2000): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  play(name: SfxName, vol: number): void {
    switch (name) {
      case 'shot':
        this.tone(620, 0.09, 'square', 0.12 * vol, 260);
        break;
      case 'hit':
        this.noise(0.12, 0.2 * vol, 1400);
        this.tone(160, 0.12, 'sawtooth', 0.14 * vol, 60);
        break;
      case 'dash':
        this.noise(0.14, 0.1 * vol, 3500);
        this.tone(300, 0.14, 'sine', 0.1 * vol, 700);
        break;
      case 'shieldUp':
        this.tone(440, 0.1, 'sine', 0.1 * vol, 660);
        break;
      case 'block':
        this.tone(880, 0.07, 'triangle', 0.16 * vol, 440);
        this.noise(0.06, 0.08 * vol, 4000);
        break;
      case 'guardBreak':
        this.tone(500, 0.35, 'sawtooth', 0.16 * vol, 90);
        this.noise(0.3, 0.15 * vol, 900);
        break;
      case 'ringOut':
        this.tone(700, 0.5, 'sawtooth', 0.2 * vol, 60);
        this.noise(0.4, 0.25 * vol, 800);
        break;
      case 'draftPick':
        this.tone(523, 0.12, 'sine', 0.14 * vol);
        this.tone(784, 0.2, 'sine', 0.12 * vol);
        break;
      case 'countdown':
        this.tone(440, 0.1, 'square', 0.08 * vol);
        break;
      case 'fight':
        this.tone(660, 0.25, 'square', 0.12 * vol, 880);
        break;
      case 'victory':
        this.tone(523, 0.18, 'sine', 0.14 * vol);
        setTimeout(() => this.tone(659, 0.18, 'sine', 0.14 * vol), 140);
        setTimeout(() => this.tone(784, 0.35, 'sine', 0.16 * vol), 280);
        break;
      case 'defeat':
        this.tone(300, 0.3, 'sawtooth', 0.12 * vol, 150);
        setTimeout(() => this.tone(220, 0.5, 'sawtooth', 0.12 * vol, 90), 220);
        break;
      case 'zap':
        this.tone(1200, 0.08, 'square', 0.09 * vol, 300);
        break;
      case 'burn':
        this.noise(0.1, 0.05 * vol, 1000);
        break;
    }
  }
}

export const sfx = new AudioEngine();
