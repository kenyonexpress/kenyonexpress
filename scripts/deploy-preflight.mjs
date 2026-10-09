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
