/**
 * Pure logic for the daily pg_dump -> R2 pipeline (docs/ARCHITECTURE-BACKUP-DR.md §5).
 *
 * Everything here is deliberately side-effect free so it can be unit tested by
 * vitest without a database, a bucket, or a clock. The I/O lives in r2.mjs and
 * pg-dump-to-r2.mjs; the decisions live here. The decision that matters most is
 * keysToPrune: deleting backups is the one operation in this pipeline that can
 * destroy the thing it exists to protect, so it is pure, tested, and refuses to
 * act on anything it cannot positively identify as a backup this pipeline wrote.
 */

/** Object-key prefix inside the backup bucket. Matches the layout in the DR doc. */
export const BACKUP_PREFIX = 'postgres/'

/** 30-day retention is the goal's contract; minKeep is the mass-deletion fuse. */
export const DEFAULT_RETENTION_DAYS = 30

/**
 * Never prune below this many backups no matter how old they are. A wrong
 * clock (or a retention env var fat-fingered to 0) must degrade to "kept too
 * much", never to "deleted everything".
 */
export const DEFAULT_MIN_KEEP = 7

const KEY_RE = /(?:^|\/)kenyonexpress-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z\.dump(\.sha256)?$/

/** `postgres/kenyonexpress-2026-09-08T0310Z.dump` for the given instant (UTC). */
export function backupKey(now = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const stamp = `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}Z`
  return `${BACKUP_PREFIX}kenyonexpress-${stamp}.dump`
}

/**
 * The UTC instant encoded in a backup key (dump or its .sha256 sidecar), or
 * null for any key this pipeline did not name. Null is load-bearing: an
 * unparseable key is never pruned and never chosen as "latest".
 */
export function parseBackupTimestamp(key) {
  const m = KEY_RE.exec(key)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
  const date = new Date(t)
  // Date.UTC normalises 2026-13-45; a key that round-trips differently lied.
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

/** The newest `.dump` key (not a sidecar), or null when none parse. */
export function latestDumpKey(keys) {
  let best = null
  let bestTs = -1
  for (const key of keys) {
    if (key.endsWith('.sha256')) continue
    const ts = parseBackupTimestamp(key)
    if (ts && ts.getTime() > bestTs) {
      bestTs = ts.getTime()
      best = key
    }
  }
  return best
}

/**
 * Which keys to delete under the retention policy.
 *
 * A "backup" is the dump plus its .sha256 sidecar; they live and die together
 * (a sidecar without its dump is noise, a dump without its sidecar is
 * unverifiable). Backups are ranked newest first; the newest `minKeep` are
 * immortal; of the rest, those strictly older than `retentionDays` go. Keys
 * that do not parse as backup names are never returned, whatever they are.
 */
export function keysToPrune(
  keys,
  { now = new Date(), retentionDays = DEFAULT_RETENTION_DAYS, minKeep = DEFAULT_MIN_KEEP } = {},
) {
  const byBackup = new Map() // dump-basename -> { ts, keys: [] }
  for (const key of keys) {
    const ts = parseBackupTimestamp(key)
    if (!ts) continue
    const base = key.replace(/\.sha256$/, '')
    const entry = byBackup.get(base) ?? { ts: ts.getTime(), keys: [] }
    entry.keys.push(key)
    byBackup.set(base, entry)
  }
  const backups = [...byBackup.values()].sort((a, b) => b.ts - a.ts)
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000
  const keep = Math.max(0, Math.floor(minKeep))
  const doomed = []
  backups.forEach((b, i) => {
    if (i < keep) return
    if (b.ts < cutoff) doomed.push(...b.keys)
  })
  return doomed.sort()
}

/**
 * Verdict on a `pg_restore --list` table of contents.
 *
 * The classic DR failure is a present-but-worthless backup (see
 * scripts/backup-schema.sh, which learned this first). A dump that uploads is
 * not a dump that restores; the TOC is the cheapest proof that pg_dump wrote
 * the tables we cannot live without. Production has 73 public tables as of
 * 2026-09-08; the floor is 60 so schema churn does not cry wolf while a
 * truncated dump still fails loudly.
 */
export function verifyDumpToc(
  tocText,
  {
    requiredTables = ['orders', 'order_items', 'vouchers', 'payments', 'products'],
    minTables = 60,
  } = {},
) {
  const tables = new Set()
  for (const line of tocText.split('\n')) {
    // e.g. `217; 1259 29954 TABLE public orders postgres`
    const m = /^\d+;\s+\d+\s+\d+\s+TABLE\s+public\s+(\S+)\s/.exec(line)
    if (m) tables.add(m[1])
  }
  const missing = requiredTables.filter((t) => !tables.has(t))
  const ok = missing.length === 0 && tables.size >= minTables
  return { ok, tableCount: tables.size, missing, minTables }
}

/** One line in `shasum -a 256` format, so the sidecar checks with stock tools. */
export function formatSha256Line(hexDigest, filename) {
  return `${hexDigest}  ${filename}\n`
}

/** Digest out of a sidecar produced by formatSha256Line (or shasum itself). */
export function parseSha256File(text) {
  const m = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/m.exec(text)
  if (!m) return null
  return { hexDigest: m[1], filename: m[2] }
}

/**
 * Keys (and truncation state) out of a ListObjectsV2 response. A real XML
 * parser is not worth a dependency for a document whose entire consumed
 * surface is <Key>, <IsTruncated> and <NextContinuationToken>; R2 emits no
 * attributes or nesting inside any of them.
 */
export function parseListObjectsXml(xml) {
  const keys = []
  for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
    keys.push(decodeXmlEntities(m[1]))
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const tokenMatch = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)
  return {
    keys,
    truncated,
    continuationToken: tokenMatch ? decodeXmlEntities(tokenMatch[1]) : null,
  }
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
