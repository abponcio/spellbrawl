/**
 * Tiny WebAudio synth for game SFX. No assets — everything is generated.
 * The AudioContext resumes on the first user gesture.
 */
class Synth {
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

  /** Call from a click/keydown handler to unlock audio. */
  unlock(): void {
    this.ensure();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
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

  shot(): void {
    this.tone(620, 0.09, 'square', 0.12, 260);
  }

  hit(intensity = 1): void {
    this.noise(0.12, 0.2 * intensity, 1400);
    this.tone(160, 0.12, 'sawtooth', 0.14 * intensity, 60);
  }

  dash(): void {
    this.noise(0.14, 0.1, 3500);
    this.tone(300, 0.14, 'sine', 0.1, 700);
  }

  shieldUp(): void {
    this.tone(440, 0.1, 'sine', 0.1, 660);
  }

  block(): void {
    this.tone(880, 0.07, 'triangle', 0.16, 440);
    this.noise(0.06, 0.08, 4000);
  }

  guardBreak(): void {
    this.tone(500, 0.35, 'sawtooth', 0.16, 90);
    this.noise(0.3, 0.15, 900);
  }

  ringOut(): void {
    this.tone(700, 0.5, 'sawtooth', 0.2, 60);
    this.noise(0.4, 0.25, 800);
  }

  draftPick(): void {
    this.tone(523, 0.12, 'sine', 0.14);
    this.tone(784, 0.2, 'sine', 0.12);
  }

  countdown(): void {
    this.tone(440, 0.1, 'square', 0.08);
  }

  fight(): void {
    this.tone(660, 0.25, 'square', 0.12, 880);
  }

  victory(): void {
    this.tone(523, 0.18, 'sine', 0.14);
    setTimeout(() => this.tone(659, 0.18, 'sine', 0.14), 140);
    setTimeout(() => this.tone(784, 0.35, 'sine', 0.16), 280);
  }

  defeat(): void {
    this.tone(300, 0.3, 'sawtooth', 0.12, 150);
    setTimeout(() => this.tone(220, 0.5, 'sawtooth', 0.12, 90), 220);
  }

  zap(): void {
    this.tone(1200, 0.08, 'square', 0.09, 300);
  }

  burn(): void {
    this.noise(0.1, 0.05, 1000);
  }
}

export const sfx = new Synth();
