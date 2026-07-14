import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Explicitly enable background token refresh so the access token is
        // renewed before it expires (~1h). Without this, authenticated queries
        // silently return empty due to RLS once the JWT lapses.
        autoRefreshToken: true,
        // Persist the session across reloads/navigations.
        persistSession: true,
        // Login is password-based (no magic-link / OAuth callback), so there is
        // never a session to parse out of the URL — disable to avoid needless work.
        detectSessionInUrl: false,
      },
    }
  )
  return client
}

