# Spellbrawl

A top-down wizard arena brawler for the browser. Fight AI wizards in best-of-5 rounds,
drafting one of three random boons between every round (Hades-style), with
Smash Bros-style knockback health: hits build your **Pressure %**, and the higher it
climbs, the further you fly. Get pushed off the arena and you lose a stock.

**Live:** https://spellbrawl.vercel.app

## Controls

| Input       | Action                             |
| ----------- | ---------------------------------- |
| WASD        | Move                               |
| Mouse       | Aim                                |
| Left click  | Attack (hold to auto-fire)         |
| Right click | Shield (hold)                      |
| Space/Shift | Dash                               |

## Features

- Solo modes: Duel, Skirmish, Chaos (1–3 AI wizards)
- **Settings:** AI difficulty (Easy / Normal / Hard)
- **Match stats:** damage dealt/taken, blocks, KOs, distance traveled
- **Play Online (UI):** create/join room codes — PartyKit multiplayer server coming next
- Guest Supabase auth: anonymous sign-in, cloud settings sync, match history + lifetime stats

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## GitHub + Vercel deploy

1. Create a repo on GitHub (e.g. `spellbrawl`)
2. Push this project:

```bash
git init
git add .
git commit -m "Spellbrawl: arena brawler with boons, stats, and online lobby UI"
git branch -M main
git remote add origin https://github.com/YOUR_USER/spellbrawl.git
git push -u origin main
```

3. In Vercel → Project Settings → Git → connect the GitHub repo (auto-deploy on push)

## Environment variables

Copy `.env.example` to `.env.local` for development. Set the same keys in **Vercel → Environment Variables**:

| Key | Purpose |
|-----|---------|
| `VITE_SUPABASE_URL` | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anon key (safe in browser) |
| `VITE_PARTYKIT_HOST` | PartyKit WebSocket host for online battles |

Run the SQL in `supabase/migrations/` after creating a Supabase project. Enable **Anonymous sign-ins** in Auth settings for guest mode.

## Tech

- Vite + TypeScript, Canvas 2D
- `src/engine/` — game loop, input, vectors, particles, synth audio
- `src/game/` — wizards, skills, boons, AI, match state, combat stats
- `src/scenes/` — menu, settings, lobby, draft, arena, results
- `src/net/` — Supabase client, guest auth, settings + match sync
- `supabase/migrations/` — profiles, settings, match history, player stats
