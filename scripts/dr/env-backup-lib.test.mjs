/**
 * The two decisions in the env backup that can lose or leak the secrets it
 * exists to protect: where the file is allowed to go, and whether decrypted
 * bytes are the backup or noise. Both are pure, and both are here because the
 * naive version of each is wrong in a way that looks fine.
 */
import { describe, expect, it } from 'vitest'
import {
  BUNDLE_MAGIC,
  assessFreshness,
  backupFileName,
  bundleText,
  checkBundle,
  isInsideRepo,
  parseBackupTimestamp,
  parseEnvNames,
} from './env-backup-lib.mjs'

const REPO = '/Users/ofir/kenyonexpress-web/kenyonexpress'

describe('isInsideRepo', () => {
  it('refuses the repo itself and everything under it', () => {
    expect(isInsideRepo(REPO, REPO)).toBe(true)
    expect(isInsideRepo(`${REPO}/backups`, REPO)).toBe(true)
    expect(isInsideRepo(`${REPO}/src/lib`, REPO)).toBe(true)
    // Trailing slashes are how a --out argument usually arrives.
    expect(isInsideRepo(`${REPO}/`, REPO)).toBe(true)
  })

  it('allows a sibling whose path merely starts with the repo path', () => {
    // The near-miss a startsWith() check gets wrong. Refusing this one is not
    // a safety win, it is the tool becoming useless at the obvious place to
    // put the files.
    expect(isInsideRepo(`${REPO}-backups`, REPO)).toBe(false)
    expect(isInsideRepo('/Users/ofir/ke-secrets', REPO)).toBe(false)
  })
})

describe('checkBundle', () => {
  it('accepts what bundleText writes and lists its names', () => {
    const text = bundleText({
      sources: [{ label: '.env.local', text: 'A=1\nB=2\n' }],
      now: new Date('2026-09-10T04:12:00Z'),
    })
    expect(text.split('\n')[0]).toBe(BUNDLE_MAGIC)
    expect(checkBundle(text)).toEqual({ ok: true, names: ['A', 'B'] })
  })

  it('rejects plausible-looking garbage, which is what a wrong passphrase yields', () => {
    // openssl enc is unauthenticated: a wrong passphrase exits 0 with noise
    // about one time in 256. This check is the only thing that notices. The
    // second line is real dotenv syntax on purpose: a caller that only grepped
    // for `=` would accept this.
    const verdict = checkBundle('Ã?*ÔT\nFOO=bar\n')
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/passphrase is wrong or the file is corrupt/)
  })

  it('rejects an empty decrypt', () => {
    expect(checkBundle('').ok).toBe(false)
  })
})

describe('parseEnvNames', () => {
  it('reads names only, never values, through the shapes dotenv allows', () => {
    const names = parseEnvNames(
      [
        '# a comment',
        '',
        'FOO=bar',
        'export BAZ="qux zap"',
        'EMPTY=',
        'lower_case=1',
        'not a line',
      ].join('\n'),
    )
    expect(names).toEqual(['BAZ', 'EMPTY', 'FOO', 'lower_case'])
  })

  it('counts a declared-empty variable, because empty and absent fail differently', () => {
    expect(parseEnvNames('CHECKOUT_ENABLED=')).toEqual(['CHECKOUT_ENABLED'])
  })

  it('deduplicates a name that a later line overrides', () => {
    expect(parseEnvNames('A=1\nA=2\n')).toEqual(['A'])
  })
})

describe('backupFileName / parseBackupTimestamp', () => {
  it('round-trips to the minute in UTC', () => {
    const name = backupFileName(new Date('2026-09-10T04:12:59Z'))
    expect(name).toBe('ke-env-2026-09-10T0412Z.enc')
    expect(parseBackupTimestamp(name)?.toISOString()).toBe('2026-09-10T04:12:00.000Z')
  })

  it('returns null for anything else in the directory', () => {
    expect(parseBackupTimestamp('ke-env-2026-09-10T0412Z.enc.names.txt')).toBeNull()
    expect(parseBackupTimestamp('ke-env-2026-09-10T0412Z.enc.sha256')).toBeNull()
    expect(parseBackupTimestamp('notes.txt')).toBeNull()
  })
})

describe('assessFreshness', () => {
  const now = new Date('2026-09-10T00:00:00Z')

  it('an empty directory is stale, not fresh', () => {
    // "No backups yet" and "backups stopped a year ago" are the same risk and
    // must not report as the safe default.
    expect(assessFreshness([], { now })).toMatchObject({ count: 0, stale: true })
  })

  it('ignores sidecars when counting backups', () => {
    const v = assessFreshness(
      ['ke-env-2026-09-01T0000Z.enc', 'ke-env-2026-09-01T0000Z.enc.sha256', 'README'],
      { now },
    )
    expect(v.count).toBe(1)
    expect(v.ageHours).toBeCloseTo(24 * 9, 5)
  })

  it('flags a newest backup past the window', () => {
    expect(assessFreshness(['ke-env-2026-07-01T0000Z.enc'], { now }).stale).toBe(true)
    expect(assessFreshness(['ke-env-2026-09-09T0000Z.enc'], { now }).stale).toBe(false)
  })
})
