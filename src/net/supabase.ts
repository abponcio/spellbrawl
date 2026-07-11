import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let client: SupabaseClient<Database> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient<Database>(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
  }
  return client;
}
