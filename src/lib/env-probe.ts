import { log } from '@/lib/observability/log'
import { checkAdminKey } from '@/lib/supabase/admin-key'

/**
 * BOOT-TIME LIVENESS CHECK FOR THE KEYS, because shape is no longer enough.
 *
 * `src/lib/env.ts` validates that the variables are PRESENT and
 * `lib/supabase/admin-key.ts` validates the SHAPE of a JWT key. Between them
 * they caught the mistake that had actually happened: the stock
 * `iss=supabase-demo` local key sitting in `.env.local` while the hosted project
 * answered `Invalid API key` to everything.
 *
 * Then the key was replaced with a new-format one, and admin-key.ts says so
 * itself: "The new-format keys (`sb_secret_...`) are opaque. Nothing to inspect,
 * and nothing has gone wrong with one yet." Something has now. Measured
 * 2026-09-04 against project `ixvwfbuvfxxsjiywhbbb`:
 *
 *   key                            /rest/v1/products   /auth/v1/admin/users
 *   -----------------------------  ------------------  --------------------
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  200                 -
 *   SUPABASE_SECRET_KEY            401 Invalid API key  401 Invalid API key
 *
 * Tried as `apikey`, as `Authorization: Bearer`, and as both. A well-formed,
 * present, non-demo, opaque key that the project rejects. No shape check can
 * see that, and every admin path -- the guest cart, the checkout address write,
 * the wallet balance -- fails silently underneath it.
 *
 * WHY THIS LOGS RATHER THAN THROWS. Refusing to boot on a NETWORK call makes a
 * transient DNS blip an outage, which is a worse failure than the one being
 * prevented. `env.ts` throws for the things it can decide offline; this reports.
 * It runs once per server instance, never on a request path, and it is awaited
 * nowhere so a slow Supabase cannot delay the first response.
 *
 * The messages are Hebrew because a person reads them.
 */

/** Values that are well-formed and still wrong: placeholders and stock keys. */
const DEMO_VALUES = [
  'your-project',
  'your-anon-key',
  'your-service-role-key',
  'changeme',
  'placeholder',
  'example.supabase.co',
  // The stock key from `supabase start`. admin-key.ts decodes the JWT and
  // catches this properly; the literal is here so a truncated or re-encoded
  // copy is caught too.
  'supabase-demo',
]

export type ProbeResult = {
  variable: string
  ok: boolean
  detail: string
}

export function looksLikeDemoValue(value: string): boolean {
  const lower = value.toLowerCase()
  return DEMO_VALUES.some((needle) => lower.includes(needle))
}

/**
 * One request per key, against `/auth/v1/settings`.
 *
 * ENDPOINT CHOSEN BY MEASUREMENT, not by guessing. The first version asked
 * `/rest/v1/?select=1`, which returns 401 for a PERFECTLY GOOD anon key -- so
 * the probe reported the working key as broken on its first real boot, next to
 * the one that genuinely was. Measured against this project:
 *
 *   endpoint                            anon   real-but-wrong secret   bogus
 *   ----------------------------------  -----  ---------------------   -----
 *   /rest/v1/?select=1                   401           401              401
 *   /rest/v1/                            401           401              401
 *   /rest/v1/products?select=id&limit=1  200           401              401
 *   /auth/v1/settings                    200           401              401
 *
 * The last two discriminate. `/auth/v1/settings` is the one used, because the
 * other needs a table name and a probe that breaks when a table is renamed is a
 * probe that gets deleted.
 */
async function probeKey(
  url: string,
  key: string,
  variable: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) {
      return {
        variable,
        ok: false,
        detail: `הפרויקט דחה את המפתח (HTTP ${response.status}). המפתח תקין בצורתו אבל אינו שייך לפרויקט הזה, או שבוטל. Supabase Dashboard ← Project Settings ← API Keys ← להעתיק מחדש.`,
      }
    }
    return { variable, ok: true, detail: `אומת מול הפרויקט (HTTP ${response.status}).` }
  } catch (error) {
    // A network failure is NOT a bad key, and saying so would send the reader
    // to the dashboard for a problem that is not there.
    const reason = error instanceof Error ? error.message : String(error)
    return {
      variable,
      ok: true,
      detail: `לא ניתן היה לאמת מול השרת (${reason}). זו אינה עדות שהמפתח שגוי.`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs every check and reports. Never throws: see the header.
 *
 * @returns the results, so a test can assert on them without a server.
 */
export async function probeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  timeoutMs = 5000,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []

  const url = source.NEXT_PUBLIC_SUPABASE_URL
  const anon = source.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const admin = source.SUPABASE_SECRET_KEY ?? source.SUPABASE_SERVICE_ROLE_KEY
  const adminVariable = source.SUPABASE_SECRET_KEY
    ? 'SUPABASE_SECRET_KEY'
    : 'SUPABASE_SERVICE_ROLE_KEY'

  // --- offline checks first: a demo value needs no network to be wrong -----
  for (const [variable, value] of [
    ['NEXT_PUBLIC_SUPABASE_URL', url],
    ['NEXT_PUBLIC_SUPABASE_ANON_KEY', anon],
    [adminVariable, admin],
  ] as const) {
    if (!value) {
      results.push({ variable, ok: false, detail: 'חסר לגמרי.' })
      continue
    }
    if (looksLikeDemoValue(value)) {
      results.push({
        variable,
        ok: false,
        detail: 'ערך דמו או placeholder, לא מפתח אמיתי של הפרויקט.',
      })
    }
  }

  const shape = checkAdminKey(admin)
  if (!shape.ok) {
    results.push({ variable: adminVariable, ok: false, detail: shape.message })
  }

  // --- the network half ----------------------------------------------------
  if (url && !looksLikeDemoValue(url)) {
    if (anon && !looksLikeDemoValue(anon)) {
      results.push(await probeKey(url, anon, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', timeoutMs))
    }
    if (admin && !looksLikeDemoValue(admin) && shape.ok) {
      results.push(await probeKey(url, admin, adminVariable, timeoutMs))
    }
  }

  return results
}

/** Probe, then say so loudly. Fire-and-forget from instrumentation. */
export async function reportEnvironment(): Promise<void> {
  const results = await probeEnvironment()
  const broken = results.filter((r) => !r.ok)

  if (broken.length === 0) {
    log.info('env.probe_ok', { checked: results.length })
    return
  }

  for (const result of broken) {
    log.error('env.probe_failed', {
      variable: result.variable,
      detail: result.detail,
    })
  }
  log.error('env.probe_summary', {
    detail: `‏${broken.length} משתני סביבה אינם תקינים. הנתיבים שתלויים בהם ייכשלו בשקט: העגלה של אורח, כתיבת כתובת בצ׳קאאוט, ויתרת הארנק.`,
    variables: broken.map((r) => r.variable),
  })
}
