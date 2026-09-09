/**
 * Pure logic behind `env-backup.mjs`.
 *
 * WHY AN ENV BACKUP IS A DR ITEM AT ALL. Every other artefact in scripts/dr/
 * protects rows. None of them protect the twenty-odd values that let a restored
 * database serve traffic: the Cardcom credentials, `VOUCHER_QR_SECRET` (which
 * signs every coupon in circulation, so losing it invalidates coupons that are
 * already in customers' hands), `CRON_SECRET`, the Resend and Sentry keys.
 * Those live in exactly two places today: Vercel's project settings and one
 * `.env.local` on one laptop. Losing the Vercel account and the laptop together
 * is not an exotic scenario; it is the scenario the offsite dump exists for.
 *
 * THE RULE THIS FILE ENFORCES ABOVE ALL OTHERS. An env backup is a file whose
 * whole content is secrets. It must never be written anywhere inside the git
 * working tree, because the repo has an autopilot loop that commits whole
 * directories on a timer (docs/RUNBOOK.md). `isInsideRepo` is the fuse, it is
 * pure, and it is tested against the near-miss that a naive prefix check gets
 * wrong: a sibling directory whose path starts with the repo path.
 */

import { sep } from 'node:path'

/**
 * First line of every bundle, and the only thing standing between a wrong
 * passphrase and a file full of garbage.
 *
 * MEASURED, 2026-09-10. `openssl enc -aes-256-cbc` is unauthenticated. Decrypting
 * a real bundle with a deliberately wrong passphrase did NOT fail: PKCS#7
 * padding validated by chance (it does roughly one time in 256) and openssl
 * printed 300 bytes of noise and exited 0. A restore procedure that pipes that
 * into `env.txt` produces an environment file that exists, is the right size,
 * and is worthless, which is precisely the failure this directory was built to
 * refuse. `enc` cannot use an AEAD mode, so the integrity check is this header.
 */
export const BUNDLE_MAGIC = '# KenyonExpress environment backup'

/** `ke-env-2026-09-10T0412Z.enc`, sorting lexicographically == chronologically. */
export function backupFileName(now = new Date(), ext = 'enc') {
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}Z`
  return `ke-env-${stamp}.${ext}`
}

const NAME_RE = /(?:^|\/)ke-env-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z\.enc$/

/** The instant in a backup filename, or null for a name we did not write. */
export function parseBackupTimestamp(name) {
  const m = NAME_RE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(mo) ||
    date.getUTCDate() !== Number(d) ||
    date.getUTCHours() !== Number(h) ||
    date.getUTCMinutes() !== Number(mi)
  ) {
    return null
  }
  return date
}

/**
 * Is `target` the repo directory or anything under it?
 *
 * The obvious `target.startsWith(repoRoot)` says yes for
 * `/Users/ofir/kenyonexpress-web/kenyonexpress-backups`, which is a sibling and
 * a perfectly good place to keep these files. Comparing on segment boundaries
 * is the difference between a fuse and a nuisance.
 */
export function isInsideRepo(target, repoRoot) {
  const norm = (p) => p.replace(new RegExp(`\\${sep}+$`), '')
  const t = norm(target)
  const r = norm(repoRoot)
  return t === r || t.startsWith(r + sep)
}

/**
 * The variable names in a dotenv file, sorted and deduplicated.
 *
 * Names only, never values: this is what gets printed to a terminal, pasted
 * into a report, and committed. `KEY=` with an empty value still counts as
 * declared, because "declared empty" and "absent" fail differently at boot
 * (docs/ENV-REFERENCE.md §0).
 */
export function parseEnvNames(text) {
  const names = new Set()
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (m) names.add(m[1])
  }
  return [...names].sort()
}

/**
 * The plaintext that gets encrypted: a header naming what went in, then each
 * source verbatim. Deterministic apart from `now`, so the round-trip check in
 * env-backup.mjs is a byte comparison and not a judgement call.
 */
export function bundleText({ sources, now = new Date() }) {
  const head = [
    BUNDLE_MAGIC,
    `# created: ${now.toISOString()}`,
    `# sources: ${sources.map((s) => s.label).join(', ')}`,
    '# restore: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file> -out env.txt',
    '',
  ].join('\n')
  const body = sources
    .map(
      (s) =>
        `# ---- begin ${s.label} ----\n${s.text.replace(/\n*$/, '\n')}# ---- end ${s.label} ----\n`,
    )
    .join('\n')
  return `${head}${body}`
}

/**
 * How stale the newest backup is. A backup process that quietly stopped looks
 * exactly like one that never ran, and both look like success until the day it
 * matters, so staleness is a first-class output rather than a footnote.
 */
export function assessFreshness(names, { now = new Date(), warnAfterHours = 24 * 35 } = {}) {
  const stamps = names.map(parseBackupTimestamp).filter(Boolean)
  if (stamps.length === 0) return { count: 0, newest: null, ageHours: null, stale: true }
  const newest = new Date(Math.max(...stamps.map((d) => d.getTime())))
  const ageHours = (now.getTime() - newest.getTime()) / 3_600_000
  return { count: stamps.length, newest, ageHours, stale: ageHours > warnAfterHours }
}

/**
 * Does `text` look like a bundle this tool wrote? Returns a reason on failure
 * so the caller can say which of the two things went wrong.
 */
export function checkBundle(text) {
  const first = String(text).split('\n', 1)[0]
  if (first !== BUNDLE_MAGIC) {
    return {
      ok: false,
      reason:
        'the decrypted bytes do not start with the bundle header. Either the passphrase is ' +
        'wrong or the file is corrupt; unauthenticated AES-CBC cannot tell you which.',
    }
  }
  return { ok: true, names: parseEnvNames(text) }
}
