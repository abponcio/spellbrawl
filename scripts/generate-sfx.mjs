/**
 * Generate minimal WAV SFX files into public/sfx/ for the asset loader.
 * Run: node scripts/generate-sfx.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'sfx');
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 22050;

function writeWav(name, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE((s * 0x7fff) | 0, 44 + i * 2);
  }
  writeFileSync(join(outDir, `${name}.wav`), buffer);
}

function tone(freq, dur, type = 'sine', vol = 0.3) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = 1 - i / n;
    let v = 0;
    const ph = 2 * Math.PI * freq * t;
    if (type === 'sine') v = Math.sin(ph);
    else if (type === 'square') v = Math.sin(ph) > 0 ? 1 : -1;
    else if (type === 'saw') v = 2 * ((freq * t) % 1) - 1;
    else v = Math.sin(ph) > 0 ? 1 : -1;
    out[i] = v * vol * env;
  }
  return out;
}

function noise(dur, vol = 0.2) {
  const n = Math.floor(SAMPLE_RATE * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * vol * (1 - i / n);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const files = {
  shot: tone(620, 0.08, 'square', 0.25),
  hit: concat(noise(0.1, 0.35), tone(140, 0.1, 'saw', 0.3)),
  dash: concat(noise(0.12, 0.15), tone(320, 0.12, 'sine', 0.2)),
  shield: tone(480, 0.1, 'sine', 0.25),
  block: concat(tone(900, 0.06, 'triangle', 0.3), noise(0.05, 0.15)),
  'guard-break': concat(tone(480, 0.3, 'saw', 0.3), noise(0.25, 0.2)),
  'ring-out': concat(tone(680, 0.45, 'saw', 0.35), noise(0.35, 0.25)),
  draft: concat(tone(520, 0.1, 'sine', 0.3), tone(780, 0.15, 'sine', 0.25)),
  countdown: tone(440, 0.09, 'square', 0.2),
  fight: tone(660, 0.22, 'square', 0.25),
  victory: concat(tone(523, 0.15, 'sine', 0.3), tone(659, 0.15, 'sine', 0.28), tone(784, 0.3, 'sine', 0.32)),
  defeat: concat(tone(300, 0.28, 'saw', 0.25), tone(220, 0.45, 'saw', 0.22)),
  zap: tone(1100, 0.07, 'square', 0.2),
  burn: noise(0.09, 0.12),
};

for (const [name, samples] of Object.entries(files)) {
  writeWav(name, samples);
  console.log('wrote', name);
}
