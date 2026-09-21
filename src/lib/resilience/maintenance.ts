import { t } from '@/lib/i18n/messages'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * Maintenance mode (section 83). docs/ARCHITECTURE-FEATURE-FLAGS.md listed
 * `MAINTENANCE_MODE` as "public maintenance page; admin stays" from the
 * first draft, and nothing read it until 2026-09-22.
 *
 * ENV-ONLY, read at request time in the proxy. The proxy runs on every
 * request before any database is touched, and a maintenance switch that
 * needed the database to say "the database is being worked on" would be no
 * switch at all. Same on-values as the kill switches: only a value that
 * plainly says so.
 *
 * What stays up: the admin panel (the operator turning the page off needs a
 * way in), the scheduled jobs and the health endpoint (a scheduler that sees
 * 503 opens incidents about the maintenance it was told about), monitoring,
 * and static assets the page itself needs.
 */

export const MAINTENANCE_ENV = 'MAINTENANCE_MODE'
/** Seconds a client should wait before trying again; also the Retry-After. */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 300

const ON = new Set(['1', 'true', 'on', 'yes'])

export function isMaintenanceMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[MAINTENANCE_ENV]
  return typeof raw === 'string' && ON.has(raw.trim().toLowerCase())
}

const EXEMPT_PREFIXES = [
  '/admin',
  '/api/admin',
  '/api/cron',
  '/api/health',
  '/monitoring',
  '/_next',
]
const EXEMPT_EXACT = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/manifest.json',
])

/** Paths the page does not cover while the shop is down. */
export function isMaintenanceExempt(pathname: string): boolean {
  if (EXEMPT_EXACT.has(pathname)) return true
  // A prefix matches the path itself or a child of it, never a longer word:
  // /administrator is the shop, not the admin.
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * The page itself: one self-contained RTL document, no scripts, no external
 * assets, so it renders when nothing else does. Copy comes from the message
 * catalog; the HTML carries it through expressions on purpose (the i18n gate
 * counts Hebrew sitting directly between tags).
 */
export function maintenanceHtml(): string {
  const title = escapeHtml(t('maintenance.title'))
  const body = escapeHtml(t('maintenance.body'))
  const retry = escapeHtml(t('maintenance.retry'))
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body{margin:0;font-family:Heebo,Arial,Helvetica,sans-serif;background:${OFF_PAGE.panel};color:${OFF_PAGE.ink};display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  main{max-width:520px;background:${OFF_PAGE.paper};border:1px solid ${OFF_PAGE.rule};border-radius:16px;padding:32px;text-align:center}
  h1{font-size:24px;margin:0 0 12px}
  p{font-size:16px;line-height:1.7;margin:0 0 8px;color:${OFF_PAGE.muted}}
  .brand{display:inline-block;background:${OFF_PAGE.brand};border-radius:999px;padding:6px 14px;font-weight:800;margin-bottom:18px}
</style>
</head>
<body>
<main>
  <div class="brand">KenyonExpress</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <p>${retry}</p>
</main>
</body>
</html>`
}

/** The response headers a maintenance answer carries. */
export function maintenanceHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Retry-After': String(MAINTENANCE_RETRY_AFTER_SECONDS),
    'Cache-Control': 'no-store',
  }
}
