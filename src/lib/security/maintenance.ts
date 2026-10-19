/**
 * Maintenance mode: one environment variable, flipped from the Vercel
 * dashboard, answers every storefront request with a 503 and a Hebrew page.
 *
 * What stays up is deliberate. Payment webhooks and the return of a card
 * charge already in flight must still settle (a 503 to Cardcom is a retry
 * storm and a charged card with no order), crons keep the outbox and the
 * expiry sweep moving, health probes keep reporting, and the admin and login
 * paths stay reachable so the operator can turn the flag off from inside.
 */
export function maintenanceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.MAINTENANCE_MODE
  return v === '1' || v === 'true'
}

const EXEMPT_PREFIXES = [
  '/api/payments',
  '/api/webhooks',
  '/api/cron',
  '/api/health',
  '/api/ready',
  '/checkout/frame-return',
  '/checkout/return',
  '/admin',
  '/login',
  '/auth',
  '/monitoring',
  '/_next',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sw.js',
]

export function isMaintenanceExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export const MAINTENANCE_RETRY_AFTER_SECONDS = 600

export const MAINTENANCE_HTML = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>בעוד רגע חוזרים</title>
<style>body{font-family:system-ui,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem;text-align:center}main{max-width:28rem}h1{font-size:1.5rem}</style>
</head><body><main><h1>האתר בעבודת תחזוקה קצרה</h1>
<p>אנחנו משדרגים את האתר וחוזרים בעוד כמה דקות. תודה על הסבלנות.</p></main></body></html>`
