import { getSupabase, isSupabaseConfigured } from './supabase';

let userId: string | null = null;
let bootPromise: Promise<string | null> | null = null;

export function getUserId(): string | null {
  return userId;
}

/** Anonymous guest session — persists in localStorage via supabase-js. */
export async function ensureGuestSession(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  if (userId) return userId;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const sb = getSupabase()!;
    const { data: existing } = await sb.auth.getSession();
    if (existing.session?.user) {
      userId = existing.session.user.id;
      return userId;
    }

    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.warn('[spellbrawl] guest sign-in failed:', error.message);
      return null;
    }
    userId = data.user?.id ?? null;
    return userId;
  })();

  return bootPromise;
}
