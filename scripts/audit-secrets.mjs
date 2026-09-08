#!/usr/bin/env node
/**
 * THE SECRETS AUDIT STEP 18 NAMES, WHICH DID NOT EXIST.
 *
 * Measured 2026-09-08: zero occurrences of `gitleaks`, `trufflehog` or any
 * other repository scanner anywhere in `.github/` or `package.json`. What did
 * exist is `scripts/compromised-keys.mjs`, and it answers a different question -
 * it checks the ENVIRONMENT at deploy time for keys already known to be
 * exposed. Nothing looked at what is committed.
 *
 * That gap matters more here than in most repositories. A `service_role` JWT
 * was committed once already (`.env.test`, commit 11a5303); it did no harm
 * only because it belonged to a different project and had expired, which that
 * file's own header calls "luck, not design". Several agents commit to this
 * repo, at least one of them with permissions skipped.
 *
 * TRACKED FILES ONLY. An untracked file on somebody's laptop is not a
 * repository risk, and scanning the working tree would flag `.env.local` on
 * every run - which is how a scanner teaches people to ignore it.
 *
 * IT DOES NOT SCAN ITSELF, and that is a deliberate exemption rather than a
 * blind spot: a file whose whole purpose is to contain credential patterns will
 * match credential patterns. This repository has produced that false positive
 * five times in one day - a migration linter that failed on its own prose, a
 * cache table that counted six comments as code - so the exemption is narrow,
 * named, and asserted by the test.
 *
 *   node scripts/audit-secrets.mjs
 *
 * Exit: 0 clean, 1 findings.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'

/** Files exempt from CONTENT scanning, each with the reason. */
const CONTENT_EXEMPT = new Map([
  ['scripts/audit-secrets.mjs', 'this file; it is made of credential patterns'],
  ['scripts/audit-secrets.test.mjs', 'its test, which must contain samples to assert on'],
  [
    'scripts/compromised-keys.mjs',
    'holds SHA-256 DIGESTS of exposed keys, never the values; that is the point of it',
  ],
  [
    '.env.test',
    'placeholders, and its header documents the one real key that was committed here and why it authorises nothing',
  ],
  ['.env.example', 'variable names and empty values, which is what an example is'],
])

/** Filenames that are allowed to look like environment files. */
const FILENAME_EXEMPT = new Set(['.env.example', '.env.test'])

/**
 * High-signal only. A scanner that reports maybes gets muted, and a muted
 * scanner is worse than none: every pattern here is something that should never
 * appear in a tracked file under any circumstances.
 */
const PATTERNS = [
  // LENGTH IS THE DISCRIMINATOR, NOT A FILENAME EXEMPTION. The first version of
  // this script flagged three test files. All three were fixtures - a private
  // key whose entire body is the four characters `MIIE`, and two `sb_secret_`
  // placeholders of 21 and 22 characters. Exempting those files by name would
  // have blinded the scanner to a real key pasted into a test, which is a
  // likelier accident than a real key in a source file. Real key material is
  // long; the thresholds below separate them by CLASS.
  [
    /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{100,}?-----END/,
    'a private key block with real key material',
  ],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/, 'a service_role JWT'],
  [/\bsb_secret_[A-Za-z0-9_-]{40,}/, 'a Supabase secret key'],
  [/\bsk_(?:live|test)_[A-Za-z0-9]{20,}/, 'a Stripe-style secret key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'a GitHub personal access token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
]

/**
 * Findings that are real, already reported, and cannot be cleared by this
 * script. An entry is a recorded defect with the action needed, NOT a waiver.
 *
 * The gate exits 0 while every finding is known, so that a red check means
 * something NEW. It exits 1 if a known entry stops matching, because a stale
 * allowlist is how a suppression outlives the problem it was written for.
 */
const KNOWN = new Map([
  [
    '^[A-Z_]* .env.local',
    'A 15,915-byte dump of the `less` help screen, committed 2026-09-08 in 8dd678d18 ' +
      '("checkpoint before checking out arch/category-page", 4 files, also deleting 2795 ' +
      'lines of STATE.md - a broad `git add`, which CLAUDE.md forbids). The name comes ' +
      'from an unquoted grep pattern. It holds NO credentials - checked - but its name ' +
      'claims to. ACTION: the owner deletes it; deleting files is one of the four ' +
      'conditions this project reserves for a human.',
  ],
])

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const findings = []

for (const file of tracked) {
  const base = file.split('/').pop() ?? file

  // 1. A name that claims to be an environment file.
  if (/\.env(\.|$)/.test(base) && !FILENAME_EXEMPT.has(file)) {
    findings.push({ file, why: 'a tracked file named like an environment file' })
  }

  // 2. A name no command should have produced. This is how a 15KB dump of the
  //    `less` help screen arrived in this repository, committed under the name
  //    `^[A-Z_]* .env.local` by an unquoted grep pattern in a checkpoint commit.
  if (/[*?^$|<>"'`\\]/.test(file)) {
    findings.push({
      file,
      why: 'shell metacharacters in the filename; a mangled command wrote this',
    })
  }

  if (CONTENT_EXEMPT.has(file)) continue

  let size = 0
  try {
    size = statSync(file).size
  } catch {
    continue
  }
  if (size > 2_000_000) continue

  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue

  for (const [pattern, what] of PATTERNS) {
    if (pattern.test(text)) findings.push({ file, why: what })
  }
}

// A scan that matched nothing because it looked at nothing is the failure mode
// every scanner in this repository has hit at least once.
if (tracked.length < 500) {
  console.error(
    `audit-secrets: only ${tracked.length} tracked files seen; refusing to report clean`,
  )
  process.exit(1)
}

const fresh = findings.filter((f) => !KNOWN.has(f.file))
const seen = new Set(findings.map((f) => f.file))
const stale = [...KNOWN.keys()].filter((file) => !seen.has(file))

for (const [file, note] of KNOWN) {
  if (seen.has(file)) console.log(`audit-secrets: KNOWN  ${file}\n  ${note}\n`)
}

if (stale.length) {
  console.error('audit-secrets: these are recorded as known findings and no longer match.')
  console.error('Remove the entry; a suppression that outlives its problem hides the next one.\n')
  for (const file of stale) console.error(`  ${file}`)
  process.exit(1)
}

if (fresh.length === 0) {
  console.log(
    `audit-secrets: no new findings (${tracked.length} tracked files, ${KNOWN.size} known)`,
  )
  process.exit(0)
}

console.error(`audit-secrets: ${fresh.length} NEW finding(s) in ${tracked.length} tracked files\n`)
for (const f of fresh) console.error(`  ${f.file}\n    ${f.why}`)
process.exit(1)
