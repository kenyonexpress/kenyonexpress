#!/usr/bin/env node
/**
 * The other end of env-backup.mjs, and the only supported way to read one of
 * its files. docs/BACKUP-RECOVERY.md §4.
 *
 *   KE_ENV_BACKUP_PASSPHRASE='...' node scripts/dr/env-restore.mjs ~/ke-secrets/ke-env-2026-09-10T0412Z.enc
 *   ... node scripts/dr/env-restore.mjs <file> --out ~/restored.env
 *
 * WHY NOT JUST `openssl enc -d`. Because that command cannot fail correctly.
 * Measured 2026-09-10 on a real bundle: decrypting with a wrong passphrase
 * printed 300 bytes of noise and exited 0, because AES-256-CBC is
 * unauthenticated and PKCS#7 padding validated by luck. Piping that into
 * `env.txt` during an incident gives you a file that exists and is worthless.
 * This checks the sha256 sidecar first (corruption), then the bundle header
 * (wrong passphrase), and only then writes anything.
 *
 * Default output is stdout, so the common case (read one value, put it back
 * into Vercel) never lands secrets on disk at all.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { parseSha256File } from './backup-lib.mjs'
import { checkBundle, isInsideRepo } from './env-backup-lib.mjs'

const note = (msg) => console.error(`.. ${msg}`)
const ok = (msg) => console.error(`ok ${msg}`)
const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

const argv = process.argv.slice(2)
let file = null
let out = null
let namesOnly = false
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i]
  else if (argv[i] === '--names') namesOnly = true
  else if (!file) file = argv[i]
  else fail(`unexpected argument ${argv[i]}`)
}
if (!file) fail('usage: env-restore.mjs <file.enc> [--out FILE] [--names]')

const path = isAbsolute(file) ? file : resolve(process.cwd(), file)
if (!existsSync(path)) fail(`${path} does not exist`)

const passphrase = process.env.KE_ENV_BACKUP_PASSPHRASE
if (!passphrase) fail('KE_ENV_BACKUP_PASSPHRASE is required')

// --- 1. corruption -----------------------------------------------------------
const bytes = readFileSync(path)
if (existsSync(`${path}.sha256`)) {
  const expected = parseSha256File(readFileSync(`${path}.sha256`, 'utf8'))
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (!expected) fail(`${path}.sha256 is unreadable`)
  if (expected.hexDigest !== actual) {
    fail(
      `sha256 mismatch: the file changed since it was written (expected ${expected.hexDigest.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`,
    )
  }
  ok('sha256 matches the sidecar')
} else {
  note(
    'no .sha256 sidecar next to this file; corruption cannot be distinguished from a wrong passphrase',
  )
}

// --- 2. decrypt --------------------------------------------------------------
const dec = spawnSync(
  'openssl',
  [
    'enc',
    '-aes-256-cbc',
    '-pbkdf2',
    '-iter',
    '600000',
    '-salt',
    '-d',
    '-in',
    path,
    '-pass',
    'env:KE_ENV_BACKUP_PASSPHRASE',
  ],
  { encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024 },
)
if (dec.error?.code === 'ENOENT') fail('openssl not found on PATH.')
if (dec.status !== 0) {
  fail(`openssl refused the file (${dec.status}): ${(dec.stderr || '').trim().slice(-300)}`)
}

// --- 3. is it ours -----------------------------------------------------------
const verdict = checkBundle(dec.stdout)
if (!verdict.ok) fail(verdict.reason)
ok(`bundle verified: ${verdict.names.length} variables`)

if (namesOnly) {
  console.log(verdict.names.join('\n'))
  process.exit(0)
}

if (out) {
  const target = isAbsolute(out) ? out : resolve(process.cwd(), out)
  if (isInsideRepo(target, process.cwd())) {
    fail(`refusing to write plaintext secrets to ${target}: it is inside the git working tree`)
  }
  writeFileSync(target, dec.stdout, { mode: 0o600 })
  ok(`wrote ${target} (mode 0600)`)
} else {
  process.stdout.write(dec.stdout)
}
