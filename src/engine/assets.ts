/**
 * Minimal image asset loader. Every draw site has a vector fallback,
 * so a missing or still-loading image never breaks rendering.
 *
 * Assets flagged for chroma keying (the wizard sprites, generated on a
 * pure-green backdrop) are processed once on load: green pixels become
 * transparent and green spill on edge pixels is neutralized.
 */
export type GameAsset = HTMLImageElement | HTMLCanvasElement;

const images = new Map<string, GameAsset>();

function chromaKeyGreen(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const spill = g - Math.max(r, b);
    if (spill > 0) {
      const t = Math.min(1, spill / 80);
      px[i + 3] = Math.round(px[i + 3] * (1 - t));
      px[i + 1] = Math.max(r, b); // kill remaining green cast on edges
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export function preloadAssets(names: string[], opts?: { chromaKey?: boolean }): void {
  for (const name of names) {
    const img = new Image();
    img.onload = () => {
      images.set(name, opts?.chromaKey ? chromaKeyGreen(img) : img);
    };
    img.src = `/art/${name}.png`;
  }
}

export function getAsset(name: string): GameAsset | null {
  return images.get(name) ?? null;
}
