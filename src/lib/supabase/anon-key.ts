// The single place the anon (publishable) key is read from the environment.
//
// WHY THIS EXISTS
//
// Rotating the key used to mean editing nine call sites that each spelled
// `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` by hand, and hoping the grep
// caught them all. Now every client factory, the proxy and the redirect
// loader go through here, so a rotation is an env change plus a redeploy,
// not a code hunt. The procedure lives in docs/RUNBOOK.md under
// "Rotating the Supabase anon (publishable) key".
//
// TWO NAMES, AND THE ORDER IS THE POINT
//
// `SUPABASE_ANON_KEY` is a plain server-side variable: change it in Vercel
// and the next serverless instance carries the new key, no rebuild involved.
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` is inlined into the client bundle at BUILD
// time, so the browser only picks a new value up on the next build. During a
// rotation the two legitimately differ for a window: the server is already on
// the new key while deployed HTML still carries the old one. Preferring
// `SUPABASE_ANON_KEY` lets the server move first, and Supabase accepting both
// keys during the overlap (two publishable keys can be live at once) is what
// makes the swap zero-downtime.
//
// In the browser bundle `process.env.SUPABASE_ANON_KEY` compiles to
// undefined (only NEXT_PUBLIC_ values are inlined), so the fallback is what
// the client always gets. That is not an accident; a non-public variable
// must never reach the bundle.
//
// `||` rather than `??` on purpose: an empty string in the env is "not set",
// not a key.

export function getAnonKey(): string | undefined {
  return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined
}

export function requireAnonKey(): string {
  const key = getAnonKey()
  if (!key) {
    throw new Error(
      'Missing Supabase anon key: set SUPABASE_ANON_KEY (server) or NEXT_PUBLIC_SUPABASE_ANON_KEY (browser + server fallback).',
    )
  }
  return key
}
