#!/usr/bin/env node
/**
 * Fetch the newest verified dump from the backup bucket to local disk.
 * First step of both the quarterly drill (.github/workflows/db-restore-drill.yml)
 * and a real restore (docs/DB-RESTORE-RUNBOOK.md). Downloads the newest
 * `postgres/kenyonexpress-*.dump`, checks it against its sha256 sidecar, and
 * refuses to hand over anything that does not match: a corrupt download
 * discovered at pg_restore time costs an hour; discovered here it costs a retry.
 *
 *   BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_ACCESS_KEY_ID=... \
 *   BACKUP_R2_SECRET_ACCESS_KEY=... BACKUP_R2_BUCKET=... \
 *   node scripts/dr/restore-latest.mjs [--out=DIR]
 *
 * Prints DUMP_FILE=<path> and DUMP_KEY=<key> (also into $GITHUB_OUTPUT when set).
 */

import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  BACKUP_PREFIX,
  latestDumpKey,
  parseBackupTimestamp,
  parseSha256File,
} from './backup-lib.mjs'
import { r2ConfigFromEnv, r2Get, r2List } from './r2.mjs'

const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

const outDir = resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'restore-work')
const cfg = r2ConfigFromEnv()

const keys = await r2List(cfg, BACKUP_PREFIX)
const key = latestDumpKey(keys)
if (!key)
  fail(`no dumps under ${BACKUP_PREFIX} in bucket ${cfg.bucket}. Has db-backup.yml ever run green?`)

const age = Date.now() - parseBackupTimestamp(key).getTime()
console.log(`.. latest is ${key} (${Math.round(age / 3_600_000)}h old)`)
if (age > 36 * 3_600_000) {
  // Not fatal for a drill, but the DR doc's watchdog line: no dump in 36h is an incident.
  console.error('WARNING: newest dump is over 36h old; the daily backup job is not running.')
}

const [dumpBuffer, sidecarBuffer] = await Promise.all([
  r2Get(cfg, key),
  r2Get(cfg, `${key}.sha256`),
])
const expected = parseSha256File(sidecarBuffer.toString('utf8'))
if (!expected) fail(`sidecar ${key}.sha256 is unreadable; refusing an unverifiable dump`)
const actual = createHash('sha256').update(dumpBuffer).digest('hex')
if (actual !== expected.hexDigest) {
  fail(
    `sha256 mismatch for ${key}: sidecar ${expected.hexDigest}, downloaded ${actual}. Corrupt transfer or tampered object.`,
  )
}

mkdirSync(outDir, { recursive: true })
const dumpFile = join(outDir, basename(key))
writeFileSync(dumpFile, dumpBuffer)
writeFileSync(`${dumpFile}.sha256`, sidecarBuffer)

console.log(`ok verified ${dumpBuffer.length} bytes, sha256 ${actual.slice(0, 12)}…`)
console.log(`DUMP_FILE=${dumpFile}`)
console.log(`DUMP_KEY=${key}`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `dump_file=${dumpFile}\ndump_key=${key}\n`)
}
