export const rand = (min = 0, max = 1): number => min + Math.random() * (max - min);

export const randInt = (min: number, max: number): number =>
  Math.floor(rand(min, max + 1));

export const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];

/** Pick n distinct items from an array (n clamped to array length). */
export function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  }
  return out;
}

/** Weighted pick: entries of [item, weight]. */
export function pickWeighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = Math.random() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r <= 0) return item;
  }
  return entries[entries.length - 1][0];
}
