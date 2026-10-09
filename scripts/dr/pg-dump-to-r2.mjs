#!/usr/bin/env node
/**
 * Daily full backup of the hosted Supabase Postgres to Cloudflare R2.
 * docs/ARCHITECTURE-BACKUP-DR.md §5 made real; docs/DB-RESTORE-RUNBOOK.md is
 * the other end of it. Runs from .github/workflows/db-backup.yml, and from a
 * laptop for an on-demand pre-migration snapshot.
 *
 *   SUPABASE_DB_URL=postgres://... \
 *   BACKUP_R2_ACCOUNT_ID=... BACKUP_R2_ACCESS_KEY_ID=... \
 *   BACKUP_R2_SECRET_ACCESS_KEY=... BACKUP_R2_BUCKET=... \
 *   node scripts/dr/pg-dump-to-r2.mjs
 *
 * Order of operations is the whole design:
 *   1. pg_dump -Fc to a temp file (custom format: compressed, pg_restore -j).
 *   2. Verify the dump's table of contents BEFORE uploading: an error page
 *      with a .dump extension must never reach the bucket looking like a
 *      backup (scripts/backup-schema.sh learned this the hard way).
 *   3. Upload dump + sha256 sidecar.
 *   4. Only after a verified upload, prune: 30-day retention, but never below
 *      the newest 7 backups, and never a key this pipeline did not name.
 *
 * Knobs: DUMP_SCHEMAS (default public,auth,storage), RETENTION_DAYS (30),
 * MIN_KEEP (7), PGDUMP (path to pg_dump; the server is Postgres 17, the
 * client must be >= 17 or pg_dump refuses).
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  BACKUP_PREFIX,
  backupKey,
  formatSha256Line,
  keysToPrune,
  verifyDumpToc,
} from './backup-lib.mjs'
import { r2ConfigFromEnv, r2Delete, r2List, r2Put } from './r2.mjs'

const note = (msg) => console.log(`.. ${msg}`)
const ok = (msg) => console.log(`ok ${msg}`)
const fail = (msg) => {
  console.error(`error ${msg}`)
  process.exit(1)
}

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl)
  fail(
    'SUPABASE_DB_URL is required (Supabase dashboard -> Settings -> Database -> connection string)',
  )
const cfg = r2ConfigFromEnv()

const PGDUMP = process.env.PGDUMP || 'pg_dump'
const PGRESTORE = process.env.PGRESTORE || 'pg_restore'
const schemas = (process.env.DUMP_SCHEMAS || 'public,auth,storage')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const retentionDays = Number(process.env.RETENTION_DAYS || 30)
const minKeep = Number(process.env.MIN_KEEP || 7)

const workDir = mkdtempSync(join(tmpdir(), 'ke-db-backup-'))
process.on('exit', () => rmSync(workDir, { recursive: true, force: true }))

const key = backupKey()
const dumpPath = join(workDir, basename(key))

// --- 1. dump -----------------------------------------------------------------
note(`${PGDUMP} -Fc schemas=[${schemas.join(', ')}]`)
const dump = spawnSync(
  PGDUMP,
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    ...schemas.map((s) => `--schema=${s}`),
    `--dbname=${dbUrl}`,
    `--file=${dumpPath}`,
  ],
  { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' },
)
if (dump.error?.code === 'ENOENT') {
  fail(
    `${PGDUMP} not found. brew install libpq (mac) or postgresql-client-17 (linux); server is Postgres 17 so the client must be >= 17.`,
  )
}
if (dump.status !== 0) {
  fail(`pg_dump exited ${dump.status}. Nothing was uploaded.\n${(dump.stderr || '').slice(-2000)}`)
}

// --- 2. verify before upload -------------------------------------------------
const toc = spawnSync(PGRESTORE, ['--list', dumpPath], { encoding: 'utf8' })
if (toc.status !== 0) {
  fail(
    `pg_restore --list cannot read the dump; refusing to upload a file pg_restore rejects.\n${(toc.stderr || '').slice(-1000)}`,
  )
}
const verdict = verifyDumpToc(toc.stdout)
if (!verdict.ok) {
  fail(
    `dump failed verification: ${verdict.tableCount} public tables (floor ${verdict.minTables})${verdict.missing.length ? `, missing [${verdict.missing.join(', ')}]` : ''}. Nothing was uploaded.`,
  )
}
const bytes = statSync(dumpPath).size
ok(`dump verified: ${verdict.tableCount} public tables, ${bytes} bytes`)

// --- 3. upload ---------------------------------------------------------------
const dumpBuffer = readFileSync(dumpPath)
const digest = createHash('sha256').update(dumpBuffer).digest('hex')
const sidecar = formatSha256Line(digest, basename(key))
writeFileSync(`${dumpPath}.sha256`, sidecar)

note(`upload ${key}`)
await r2Put(cfg, key, dumpBuffer)
await r2Put(cfg, `${key}.sha256`, Buffer.from(sidecar))
ok(`uploaded ${key} (+.sha256, digest ${digest.slice(0, 12)}…)`)

// --- 4. prune ----------------------------------------------------------------
const existing = await r2List(cfg, BACKUP_PREFIX)
const doomed = keysToPrune(existing, { retentionDays, minKeep })
for (const staleKey of doomed) {
  await r2Delete(cfg, staleKey)
  note(`pruned ${staleKey}`)
}
const dumpCount =
  existing.filter((k) => k.endsWith('.dump')).length -
  doomed.filter((k) => k.endsWith('.dump')).length
ok(
  `retention: ${dumpCount} dumps kept (${retentionDays}d window, floor ${minKeep}), ${doomed.length} objects pruned`,
)

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## DB backup\n- key: \`${key}\`\n- size: ${bytes} bytes, ${verdict.tableCount} public tables\n- sha256: \`${digest}\`\n- dumps in bucket: ${dumpCount}\n`,
  )
}
