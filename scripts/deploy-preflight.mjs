#!/usr/bin/env node
/**
 * REFUSES TO SHIP AN ENVIRONMENT THAT CARRIES A COMPROMISED KEY.
 *
 * `src/lib/env.ts` throws at BOOT if it sees one, which protects the running
 * server. That is one step too late for a deploy: by the time the boot check
 * fires, the credential is already sitting in the platform's environment store,
 * and taking it back out is a second action somebody has to remember.
 *
 * This runs BEFORE the build, so a deploy carrying the exposed key never
 * becomes an artifact. Wire it into the deploy command, not into `pnpm build`:
 * a local build with the working-but-exposed key is legitimate today, and a
 * check that blocks ordinary development gets removed.
 *
 * It also checks that the variables a deployment actually needs are present,
 * because the second most common way a deploy fails is a missing secret that
 * only surfaces on the first customer request.
 *
 * WHY `SENTRY_DSN` IS ON THE REQUIRED LIST DESPITE BEING OPTIONAL AT BOOT.
 * Measured 2026-09-08 against the live Sentry project: 49 error events in 90
 * days, every one of them from `server_name: MacBook-Air.local`, in the
 * environments `development` and `sentry-wiring-check`. `production` does not
 * appear once. Error reporting has never received a single event from a
 * deployed process.
 *
 * That is not a broken deploy, which is why nothing caught it -- an unmonitored
 * server answers every request correctly. It is a BLIND one, and the empty
 * issue stream reads exactly like a healthy one. The 2026-08-21 verification
 * that "Sentry reports for real" was run from this laptop with
 * `SENTRY_ENVIRONMENT=sentry-wiring-check`; it proved the SDK and the DSN work
 * and could not prove anything about production.
 *
 * `src/lib/observability/sentry.ts` is deliberately inert without the DSN and
 * stays that way: that behaviour is right for tests, for CI and for a local
 * `next start`. The judgement being made here is narrower -- a DEPLOY that
 * reports its errors nowhere should not leave the building. This script is the
 * only gate that distinguishes the two, because it runs from `vercel.json`'s
 * `buildCommand` and never from `pnpm build`.
 *
 * Exit: 0 clean, 1 refuse.
 */
import { compromisedKeyMessage, scanEnvironmentForCompromisedKeys } from './compromised-keys.mjs'

const REQUIRED_RUNTIME = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'CARDCOM_TERMINAL_NUMBER',
  'CARDCOM_API_NAME',
  'CARDCOM_API_PASSWORD',
  'CARDCOM_WEBHOOK_SECRET',
  'VOUCHER_QR_SECRET',
  'CRON_SECRET',
  // See the note above: absent, the deployment runs blind and looks healthy.
  'SENTRY_DSN',
]

const problems = []

// 1. The refusal that gives this script its name.
for (const finding of scanEnvironmentForCompromisedKeys()) {
  problems.push(`COMPROMISED  ${compromisedKeyMessage(finding)}`)
}

// 2. One of the two admin key names has to be there.
if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  problems.push(
    'MISSING      אחד מ-SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY חייב להיות מוגדר.',
  )
}

for (const name of REQUIRED_RUNTIME) {
  if (!process.env[name]) problems.push(`MISSING      ${name} חסר. ראה docs/ENV.md.`)
}

// 3. The one setting that silently takes the money nowhere.
if (process.env.CARDCOM_SANDBOX === 'true') {
  problems.push(
    'SANDBOX      CARDCOM_SANDBOX=true בפרודקשן: הזמנות אמיתיות ייסלקו מול מסוף בדיקה, הלקוח לא יחויב, והכסף לא יגיע לשום מקום.',
  )
}

// 4. The waiver, which is correct locally and wrong on a deploy.
if (process.env.ALLOW_INCOMPLETE_ENV === 'true') {
  problems.push(
    'WAIVER       ALLOW_INCOMPLETE_ENV=true נועד ל-`next start` מקומי בלבד. על פלטפורמת פריסה זו עקיפה של כל הבדיקות שלמעלה.',
  )
}

if (problems.length === 0) {
  console.log('deploy preflight: clean')
  process.exit(0)
}

console.error(`deploy preflight: ${problems.length} problem(s), refusing to ship\n`)
for (const problem of problems) console.error(`  ${problem}`)
process.exit(1)
