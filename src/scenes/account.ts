import type { Scene } from '../engine/scene';
import type { GameCtx } from '../game/context';
import { isSupabaseConfigured } from '../net/supabase';
import { loadAccountSummary, type AccountSummary } from '../net/profile';
import { loadSettings, saveSettings } from '../game/settings';
import { roundedRect } from '../ui/text';

export class AccountScene implements Scene {
  private summary: AccountSummary | null = null;
  private loading = true;
  private status = '';

  constructor(private ctx: GameCtx) {}

  enter(): void {
    this.loading = true;
    this.summary = null;
    this.status = isSupabaseConfigured()
      ? 'Loading your progress…'
      : 'Supabase not configured — playing offline only.';
    if (isSupabaseConfigured()) {
      void loadAccountSummary().then((s) => {
        this.summary = s;
        this.loading = false;
        if (!s) this.status = 'Could not load account data.';
        else if (s.profile?.display_name) {
          saveSettings({ ...loadSettings(), displayName: s.profile.display_name });
        }
      });
    } else {
      this.loading = false;
    }
  }

  update(_dt: number): void {
    if (this.ctx.input.wasClicked(0)) {
      const H = this.ctx.viewport.height;
      if (this.ctx.input.mouse.y >= H - 90) this.ctx.toMenu();
    }
  }

  render(g: CanvasRenderingContext2D): void {
    const W = this.ctx.viewport.width;
    const H = this.ctx.viewport.height;

    g.fillStyle = '#07070f';
    g.fillRect(0, 0, W, H);

    g.textAlign = 'center';
    g.font = '800 44px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText('ACCOUNT', W / 2, H * 0.14);

    if (this.loading) {
      g.font = '500 16px system-ui, sans-serif';
      g.fillStyle = 'rgba(200, 205, 245, 0.75)';
      g.fillText(this.status, W / 2, H * 0.5);
      return;
    }

    const s = this.summary;
    if (!s) {
      g.font = '500 16px system-ui, sans-serif';
      g.fillStyle = 'rgba(200, 205, 245, 0.75)';
      g.fillText(this.status, W / 2, H * 0.5);
      g.fillText('BACK', W / 2, H - 50);
      return;
    }

    g.font = '600 18px system-ui, sans-serif';
    g.fillStyle = s.isGuest ? '#ffe94d' : '#9fe8ff';
    g.fillText(s.isGuest ? 'Guest wizard (progress saved in this browser)' : 'Signed in', W / 2, H * 0.22);

    g.font = '700 22px system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.fillText(s.profile?.display_name ?? 'Wizard', W / 2, H * 0.28);

    const st = s.stats;
    const lines = st
      ? [
          `Matches: ${st.matches_played}  ·  W/L: ${st.wins}/${st.losses}`,
          `KOs: ${st.total_kos}  ·  Deaths: ${st.total_deaths}`,
          `Damage dealt: ${Math.round(st.total_damage_dealt)}%`,
          `Damage taken: ${Math.round(st.total_damage_taken)}%`,
          `Blocks: ${st.total_blocks}`,
          `Distance: ${(st.total_distance_m / 1000).toFixed(2)} km`,
          `Best placement: #${st.best_placement}`,
        ]
      : ['No matches recorded yet — play solo or online!'];

    const cardW = 440;
    const cardH = lines.length * 28 + 36;
    const cardY = H * 0.34;
    g.fillStyle = 'rgba(16, 17, 36, 0.92)';
    roundedRect(g, W / 2 - cardW / 2, cardY, cardW, cardH, 10);
    g.fill();
    g.font = '600 15px system-ui, sans-serif';
    g.fillStyle = 'rgba(220, 224, 255, 0.9)';
    lines.forEach((line, i) => g.fillText(line, W / 2, cardY + 28 + i * 28));

    if (s.recentMatches.length > 0) {
      g.font = '700 14px system-ui, sans-serif';
      g.fillStyle = 'rgba(200, 205, 245, 0.65)';
      g.fillText('RECENT MATCHES', W / 2, H * 0.62);
      g.font = '500 14px system-ui, sans-serif';
      s.recentMatches.slice(0, 4).forEach((m, i) => {
        const mode = m.mode === 'online' ? `online ${m.room_code ?? ''}` : 'solo';
        g.fillText(
          `#${m.placement} · ${mode} · ${m.rounds_won} rounds won`,
          W / 2,
          H * 0.66 + i * 22,
        );
      });
    }

    if (s.isGuest) {
      g.font = '500 14px system-ui, sans-serif';
      g.fillStyle = 'rgba(180, 190, 240, 0.55)';
      g.fillText('Sign up with Google/GitHub in Supabase dashboard to link progress (coming soon)', W / 2, H * 0.82);
    }

    g.font = '600 16px system-ui, sans-serif';
    g.fillStyle = 'rgba(130, 140, 255, 0.9)';
    g.fillText('BACK', W / 2, H - 50);
  }
}
