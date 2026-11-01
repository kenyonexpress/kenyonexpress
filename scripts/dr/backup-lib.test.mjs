/**
 * The pruning and verification decisions of the backup pipeline. Everything
 * destructive or gate-keeping in scripts/dr/ funnels through these pure
 * functions, so this file is where "the retention policy cannot delete the
 * wrong thing" is actually enforced.
 */
import { describe, expect, it } from 'vitest'
import {
  BACKUP_PREFIX,
  backupKey,
  formatSha256Line,
  keysToPrune,
  latestDumpKey,
  parseBackupTimestamp,
  parseListObjectsXml,
  parseSha256File,
  verifyDumpToc,
} from './backup-lib.mjs'

const key = (iso) => {
  const d = new Date(iso)
  return backupKey(d)
}

describe('backupKey / parseBackupTimestamp', () => {
  it('round-trips an instant to the minute', () => {
    const now = new Date('2026-09-08T03:10:59Z')
    const k = backupKey(now)
    expect(k).toBe('postgres/kenyonexpress-2026-09-08T0310Z.dump')
    expect(parseBackupTimestamp(k)?.toISOString()).toBe('2026-09-08T03:10:00.000Z')
  })

  it('parses the sha256 sidecar to the same instant', () => {
    const k = `${key('2026-01-02T00:00:00Z')}.sha256`
    expect(parseBackupTimestamp(k)?.toISOString()).toBe('2026-01-02T00:00:00.000Z')
  })

  it('returns null for foreign keys, including near-misses', () => {
    expect(parseBackupTimestamp('postgres/schema-2026-09-08.sql')).toBeNull()
    expect(parseBackupTimestamp('postgres/kenyonexpress-2026-09-08T0310Z.dump.age')).toBeNull()
    expect(parseBackupTimestamp('media/kenyonexpress-hero.png')).toBeNull()
    // a calendar-impossible stamp must not normalise into a real date
    expect(parseBackupTimestamp('postgres/kenyonexpress-2026-02-31T0310Z.dump')).toBeNull()
  })
})

describe('latestDumpKey', () => {
  it('picks the newest dump and never a sidecar or a stranger', () => {
    const keys = [
      key('2026-09-01T03:00:00Z'),
      `${key('2026-09-08T03:00:00Z')}.sha256`,
      key('2026-09-07T03:00:00Z'),
      'postgres/README.txt',
    ]
    expect(latestDumpKey(keys)).toBe(key('2026-09-07T03:00:00Z'))
  })

  it('returns null when nothing parses', () => {
    expect(latestDumpKey(['postgres/x.bin'])).toBeNull()
  })
})

describe('keysToPrune', () => {
  const now = new Date('2026-09-08T04:00:00Z')
  const daysAgo = (n) => key(new Date(now.getTime() - n * 86_400_000).toISOString())

  it('prunes dump and sidecar together past 30 days, keeps the window', () => {
    const keys = [daysAgo(1), daysAgo(29), daysAgo(31), `${daysAgo(31)}.sha256`, daysAgo(45)]
    // 5 backups exist but minKeep=7 would protect them all; use minKeep 2 to see the policy
    const doomed = keysToPrune(keys, { now, minKeep: 2 })
    expect(doomed).toEqual([daysAgo(45), daysAgo(31), `${daysAgo(31)}.sha256`].sort())
  })

  it('never prunes below minKeep even when everything is ancient', () => {
    const keys = [daysAgo(100), daysAgo(200), daysAgo(300)]
    expect(keysToPrune(keys, { now, minKeep: 7 })).toEqual([])
    expect(keysToPrune(keys, { now, minKeep: 2 })).toEqual([daysAgo(300)])
  })

  it('a fat-fingered retention of 0 still keeps the newest minKeep', () => {
    const keys = [daysAgo(0), daysAgo(1), daysAgo(2)]
    expect(keysToPrune(keys, { now, retentionDays: 0, minKeep: 7 })).toEqual([])
  })

  it('never touches keys it did not name', () => {
    const keys = [
      'postgres/manual-snapshot-keep-forever.dump',
      'postgres/schema-2020-01-01.sql',
      daysAgo(500),
    ]
    expect(keysToPrune(keys, { now, minKeep: 0 })).toEqual([daysAgo(500)])
  })
})

describe('verifyDumpToc', () => {
  const tocFor = (tables) =>
    tables.map((t, i) => `${i + 1}; 1259 ${1000 + i} TABLE public ${t} postgres`).join('\n')
  const manyTables = Array.from({ length: 70 }, (_, i) => `t${i}`)

  it('accepts a full dump', () => {
    const toc = tocFor([...manyTables, 'orders', 'order_items', 'vouchers', 'payments', 'products'])
    const v = verifyDumpToc(toc)
    expect(v.ok).toBe(true)
    expect(v.tableCount).toBe(75)
  })

  it('rejects when a money-path table is absent, whatever the count', () => {
    const toc = tocFor([...manyTables, 'orders', 'order_items', 'vouchers', 'products'])
    const v = verifyDumpToc(toc)
    expect(v.ok).toBe(false)
    expect(v.missing).toEqual(['payments'])
  })

  it('rejects a truncated dump under the table floor', () => {
    const toc = tocFor(['orders', 'order_items', 'vouchers', 'payments', 'products'])
    expect(verifyDumpToc(toc).ok).toBe(false)
  })

  it('does not count TABLE DATA entries or non-public schemas as tables', () => {
    const toc = [
      '1; 0 0 TABLE DATA public orders postgres',
      '2; 1259 100 TABLE auth users supabase_auth_admin',
    ].join('\n')
    expect(verifyDumpToc(toc).tableCount).toBe(0)
  })
})

describe('sha256 sidecar format', () => {
  it('round-trips and matches shasum layout', () => {
    const hex = 'a'.repeat(64)
    const line = formatSha256Line(hex, 'x.dump')
    expect(line).toBe(`${hex}  x.dump\n`)
    expect(parseSha256File(line)).toEqual({ hexDigest: hex, filename: 'x.dump' })
  })

  it('rejects garbage instead of guessing', () => {
    expect(parseSha256File('not a checksum')).toBeNull()
  })
})

describe('parseListObjectsXml', () => {
  it('extracts keys, truncation and continuation token', () => {
    const xml = `<?xml version="1.0"?><ListBucketResult>
      <IsTruncated>true</IsTruncated>
      <Contents><Key>${BACKUP_PREFIX}a.dump</Key></Contents>
      <Contents><Key>${BACKUP_PREFIX}a.dump.sha256</Key></Contents>
      <NextContinuationToken>tok&amp;1</NextContinuationToken>
    </ListBucketResult>`
    expect(parseListObjectsXml(xml)).toEqual({
      keys: [`${BACKUP_PREFIX}a.dump`, `${BACKUP_PREFIX}a.dump.sha256`],
      truncated: true,
      continuationToken: 'tok&1',
    })
  })

  it('handles the final page', () => {
    const xml = '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'
    expect(parseListObjectsXml(xml)).toEqual({
      keys: [],
      truncated: false,
      continuationToken: null,
    })
  })
})
