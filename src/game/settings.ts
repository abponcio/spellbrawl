export type AIDifficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  aiDifficulty: AIDifficulty;
  displayName: string;
}

const STORAGE_KEY = 'spellbrawl-settings';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 1,
  sfxVolume: 1,
  screenShake: true,
  aiDifficulty: 'normal',
  displayName: 'Wizard',
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
