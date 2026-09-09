import { createHash } from 'node:crypto'

/**
 * KEYS THAT ARE KNOWN TO BE EXPOSED AND MUST NEVER SERVE PRODUCTION TRAFFIC.
 *
 * A Supabase secret key is not scoped. It reads and writes every table, every
 * user row, every order and every voucher, and it can mint a token for any user.
 * There is no partial exposure of one: once it has been handled outside a secret
 * store, the only fix is rotation.
 *
 * The key in `.env.local` on 2026-09-04 was exposed during setup. It WORKS,
 * which is exactly the danger -- nothing about it looks wrong, `env.probe_ok`
 * reports clean, and it will keep working after it should have been retired.
 * A rotation that depends on somebody remembering is a rotation that does not
 * happen.
 *
 * STORED AS A SHA-256, NOT AS THE KEY. Committing the literal to a public
 * repository would publish the credential this file exists to retire, which
 * would be a comic way to lose it. The hash identifies the key without carrying
 * it: only the holder of the key can produce the digest.
 *
 * Rotation procedure: `docs/RUNBOOK.md`.
 */

/**
 * @typedef {{sha256: string, prefix: string, note: string}} CompromisedKey
 * @typedef {{variable: string, key: CompromisedKey}} CompromisedFinding
 */

/** @type {CompromisedKey[]} */
export const COMPROMISED_KEYS = [
  {
    sha256: 'f4c4f33c4baaa0edf8a14a77734f522c7fee503309da9c359a95fb70b81c1230',
    prefix: 'sb_secret_GdpC',
    note: 'SUPABASE_SECRET_KEY, exposed during setup on 2026-09-04. Working, project ixvwfbuvfxxsjiywhbbb. Rotate per docs/RUNBOOK.md.',
  },
]

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** The matching entry, or null. Comparison is on the digest, never the value. */
export function findCompromised(value) {
  if (!value) return null
  const digest = fingerprint(value.trim())
  return COMPROMISED_KEYS.find((k) => k.sha256 === digest) ?? null
}

/**
 * Every secret-bearing variable worth checking. Deliberately a list rather than
 * a scan of `process.env`: hashing every environment variable on every boot is
 * both wasteful and a good way to accidentally log one.
 */
const CHECKED = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'VOUCHER_QR_SECRET',
  'CARDCOM_API_PASSWORD',
  'CARDCOM_WEBHOOK_SECRET',
  'RESEND_API_KEY',
]

export function scanEnvironmentForCompromisedKeys(source = process.env) {
  /** @type {CompromisedFinding[]} */
  const found = []
  for (const variable of CHECKED) {
    const key = findCompromised(source[variable])
    if (key) found.push({ variable, key })
  }
  return found
}

/**
 * The Hebrew sentence a person reads when this fires.
 *
 * It names the variable and says what to do, because the whole point of a loud
 * failure is that the reader does not then have to go and find out what it meant.
 */
export function compromisedKeyMessage(finding) {
  // ONE template literal, not several joined with `+`. This repo has already
  // been bitten by that: concatenated template literals lost text in the
  // production build, and the served string was broken with a 200 and no log.
  return `‏${finding.variable} הוא מפתח שנחשף וסומן כמפוגע (${finding.key.prefix}…). מפתח סודי של Supabase עוקף כל מדיניות RLS, ולכן חשיפה אחת מחייבת רוטציה. הנוהל המלא: docs/RUNBOOK.md, בסעיף רוטציית המפתח. הערה: ${finding.key.note}`
}
