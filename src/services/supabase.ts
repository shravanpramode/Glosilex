import { createClient } from '@supabase/supabase-js';

let supabaseInstance: any = null;
let sessionPromise: Promise<string | null> | null = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  let url = sessionStorage.getItem('SUPABASE_URL')
    || import.meta.env.VITE_SUPABASE_URL
    || import.meta.env.SUPABASE_URL
    || process.env.SUPABASE_URL;

  let key = sessionStorage.getItem('SUPABASE_ANON_KEY')
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || import.meta.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;

  if (url === 'MY_SUPABASE_URL') url = null;
  if (key === 'MY_SUPABASE_ANON_KEY') key = null;

  if (!url || !key) {
    throw new Error('Supabase credentials not found in session storage or environment.');
  }

  supabaseInstance = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'glosilex-auth',
    },
  });
  return supabaseInstance;
};

/**
 * Establishes an anonymous Supabase session and returns the user id.
 *
 * Glosilex has no login screen — but RLS needs a real auth.uid() to scope rows
 * per visitor. Anonymous sign-in gives every browser a durable identity with
 * zero onboarding friction: the visitor never sees a form, and the database
 * still gets a non-NULL uid to enforce ownership against.
 *
 * Without this the client is the `anon` role, auth.uid() is NULL, every
 * `auth.uid()::text = user_id` policy evaluates to NULL, and Postgres denies
 * both the write and the read. That was the cause of the silent data loss
 * between 2026-05-26 and 2026-08-25.
 *
 * Idempotent — concurrent callers share one in-flight promise, so we never
 * race two sign-in requests.
 */
export const ensureSession = async (): Promise<string | null> => {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const supabase = getSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      // Most likely cause: anonymous sign-ins are still disabled in
      // Supabase Dashboard -> Authentication -> Sign In / Providers.
      console.error('Anonymous sign-in failed - results will not be saved:', error.message);
      sessionPromise = null; // allow a retry on the next call
      return null;
    }
    return data.user?.id ?? null;
  })();

  return sessionPromise;
};

/**
 * Current user id, establishing the anonymous session first if needed.
 * Every write path must use this instead of reading auth.getUser() directly,
 * otherwise it races the sign-in and inserts user_id: null.
 */
export const getUserId = async (): Promise<string | null> => {
  return ensureSession();
};

export const clearSupabaseInstance = () => {
  supabaseInstance = null;
  sessionPromise = null;
};
