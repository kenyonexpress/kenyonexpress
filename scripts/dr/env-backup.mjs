#!/usr/bin/env node
/**
 * Encrypted offline backup of the environment variables a restored deployment
 * needs. docs/BACKUP-RECOVERY.md §4 is the procedure; this is the tool.
 *
 *   KE_ENV_BACKUP_PASSPHRASE='...' node scripts/dr/env-backup.mjs
 *   KE_ENV_BACKUP_PASSPHRASE='...' node scripts/dr/env-backup.mjs --out ~/ke-secrets --in .env.local --in .env.production
 *
 * Order of operations, and the whole point of it:
 *   1. Read the sources. Refuse if a named one is missing; a backup of three
 *      files when four were asked for is the failure this whole directory
 *      exists to prevent.
 *   2. Encrypt to a temp file (AES-256-CBC, PBKDF2, 600k iterations).
 *   3. DECRYPT IT BACK and byte-compare with the plaintext. An unverified
 *      ciphertext is not a backup, it is a file. This is the same discipline
 *      as scripts/backup-schema.sh, which learned it from a saved error page.
 *   4. Only then move it into place, next to a names-only manifest.
 *
 * It never deletes anything. Old copies of these files are the only record of
 * a key that was rotated and then found to be needed; pruning them is an
 * operator decision, and the script only reports the count.
 *
 * WHAT IT DELIBERATELY REFUSES: writing anywhere inside the git working tree.
 * See env-backup-lib.mjs.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { formatSha256Line } from './backup-lib.mjs'
import {
  assessFreshness,
  backupFileName,
  bundleText,
  checkBundle,
  isInsideRepo,
  parseEnvNames,
} from './env-backup-lib.mjs'

const note = (msg) => console.log(`.. ${msg}`)
const ok = (msg) => console.log(`ok ${msg}`)
const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

// --- arguments ---------------------------------------------------------------
const argv = process.argv.slice(2)
const inputs = []
let outDir = process.env.KE_ENV_BACKUP_DIR || join(homedir(), 'ke-secrets')
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--in') inputs.push(argv[++i])
  else if (argv[i] === '--out') outDir = argv[++i]
  else fail(`unknown argument ${argv[i]}. Usage: env-backup.mjs [--out DIR] [--in FILE]...`)
}
if (inputs.length === 0) inputs.push('.env.local')

const repoRoot = process.cwd()
outDir = isAbsolute(outDir) ? outDir : resolve(repoRoot, outDir)

// --- the fuse ----------------------------------------------------------------
if (isInsideRepo(outDir, repoRoot)) {
  fail(
    `refusing to write secrets to ${outDir}: it is inside the git working tree. Pass --out with a path outside the repo (default ~/ke-secrets).`,
  )
}

const passphrase = process.env.KE_ENV_BACKUP_PASSPHRASE
if (!passphrase) {
  fail(
    'KE_ENV_BACKUP_PASSPHRASE is required. Use the passphrase stored in the password manager ' +
      'under "KenyonExpress env backup"; a backup nobody can decrypt is not a backup.',
  )
}
if (passphrase.length < 12) {
  fail(`KE_ENV_BACKUP_PASSPHRASE is ${passphrase.length} characters. Minimum 12.`)
}

// --- 1. read -----------------------------------------------------------------
const sources = inputs.map((rel) => {
  const path = isAbsolute(rel) ? rel : resolve(repoRoot, rel)
  if (!existsSync(path)) fail(`source ${rel} does not exist. Nothing was written.`)
  return { label: basename(path), path, text: readFileSync(path, 'utf8') }
})

const names = [...new Set(sources.flatMap((s) => parseEnvNames(s.text)))].sort()
if (names.length === 0) fail('the sources declare zero variables. Refusing to back up nothing.')
note(`${sources.length} source(s), ${names.length} distinct variable names`)

const now = new Date()
const plaintext = bundleText({ sources, now })

mkdirSync(outDir, { recursive: true, mode: 0o700 })
const finalName = backupFileName(now)
const tmpEnc = join(outDir, `.${finalName}.partial`)
process.on('exit', () => rmSync(tmpEnc, { force: true }))

// --- 2. encrypt --------------------------------------------------------------
const OPENSSL_ARGS = ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '600000', '-salt']
const enc = spawnSync(
  'openssl',
  [...OPENSSL_ARGS, '-out', tmpEnc, '-pass', 'env:KE_ENV_BACKUP_PASSPHRASE'],
  {
    input: plaintext,
    encoding: 'utf8',
    env: process.env,
  },
)
if (enc.error?.code === 'ENOENT') fail('openssl not found on PATH.')
if (enc.status !== 0) fail(`openssl enc exited ${enc.status}: ${(enc.stderr || '').slice(-500)}`)

// --- 3. verify by decrypting -------------------------------------------------
const dec = spawnSync(
  'openssl',
  [...OPENSSL_ARGS, '-d', '-in', tmpEnc, '-pass', 'env:KE_ENV_BACKUP_PASSPHRASE'],
  { encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024 },
)
if (dec.status !== 0) fail(`round-trip decrypt failed (${dec.status}). Nothing was written.`)
if (dec.stdout !== plaintext) {
  fail('round-trip decrypt did not reproduce the input byte for byte. Nothing was written.')
}
const selfCheck = checkBundle(dec.stdout)
if (!selfCheck.ok)
  fail(`round-trip produced bytes env-restore.mjs would reject: ${selfCheck.reason}`)
ok(`round-trip verified (${Buffer.byteLength(plaintext)} bytes plaintext)`)

// --- 4. commit to disk -------------------------------------------------------
const finalPath = join(outDir, finalName)
renameSync(tmpEnc, finalPath)
// openssl created the temp file under the ambient umask, which on this machine
// is 0644: world-readable, for a file that is nothing but secrets.
chmodSync(finalPath, 0o600)
const digest = createHash('sha256').update(readFileSync(finalPath)).digest('hex')
writeFileSync(`${finalPath}.sha256`, formatSha256Line(digest, finalName), { mode: 0o600 })
writeFileSync(
  `${finalPath}.names.txt`,
  `# ${names.length} variables backed up ${now.toISOString()}\n${names.join('\n')}\n`,
  { mode: 0o600 },
)
ok(`wrote ${finalPath} (mode 0600, sha256 ${digest.slice(0, 12)}…)`)
ok(`wrote ${finalPath}.names.txt (names only, safe to read aloud)`)

// --- report ------------------------------------------------------------------
const existing = readdirSync(outDir)
const freshness = assessFreshness(existing, { now })
note(`${freshness.count} backup(s) in ${outDir}; nothing was deleted`)
console.log(`\nvariables: ${names.join(', ')}`)
console.log(
  `\nto restore:\n  KE_ENV_BACKUP_PASSPHRASE=... node scripts/dr/env-restore.mjs ${finalPath}`,
)
if (freshness.stale && freshness.count > 1) {
  note('the previous backup in this directory is older than 35 days')
}
