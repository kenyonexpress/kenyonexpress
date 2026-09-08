import { describe, expect, it } from 'vitest'
import {
  PLATFORM_ENV,
  commentLineNumbers,
  parseEnvExample,
  scanAnyTypes,
  scanConsole,
  scanEnvReads,
  scanMarkers,
} from './final-audit-lib.mjs'

/**
 * Every case below is a real line from this repo that a naive grep got wrong.
 * The file paths are named so that if one of them is ever deleted, the reason
 * the scanner is shaped this way is still on record.
 */

describe('scanMarkers', () => {
  it('counts a real TODO with a scope', () => {
    const hits = scanMarkers('// TODO(cardcom): confirm the legacy refund endpoint\n')
    expect(hits).toHaveLength(1)
    expect(hits[0].marker).toBe('TODO')
    expect(hits[0].tracked).toBe(false)
  })

  it('does not count the XXX inside a phone placeholder', () => {
    // src/lib/whatsapp.ts:85. `\bXXX\b` matches the middle of this and reported
    // a work marker in a comment that is documenting a number format.
    const hits = scanMarkers('// Mobile 05X-XXX-XXXX (10 digits); everything else 0X-XXXXXXX.\n')
    expect(hits).toEqual([])
  })

  it('does not count a marker word that is only a string value', () => {
    // src/lib/whatsapp.test.ts:91 sets an env var to the literal string 'TODO'
    // to prove the code rejects an unconfigured number. It is not a marker.
    const hits = scanMarkers("process.env.NEXT_PUBLIC_WHATSAPP_PHONE = 'TODO'\n")
    expect(hits).toEqual([])
  })

  it('treats a marker whose comment names an issue as tracked', () => {
    const hits = scanMarkers(
      ['/**', ' * TODO(cardcom): confirm the field names.', ' * Tracked in #41.', ' */'].join('\n'),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].tracked).toBe(true)
  })

  it('does not let an unrelated later comment mark it tracked', () => {
    const hits = scanMarkers(
      ['// TODO: something', 'const x = 1', '// unrelated, see #41'].join('\n'),
    )
    expect(hits[0].tracked).toBe(false)
  })
})

describe('scanAnyTypes', () => {
  it('finds an undirected cast', () => {
    const hits = scanAnyTypes('const db = admin as any\n')
    expect(hits).toHaveLength(1)
    expect(hits[0].accepted).toBe(false)
  })

  it('accepts a cast the line above gives a reason for', () => {
    // src/lib/growth/client.ts. The generated types do not know the growth
    // tables, so this cast is deliberate and biome already demands the reason.
    const hits = scanAnyTypes(
      [
        '  // biome-ignore lint/suspicious/noExplicitAny: see the module comment',
        '  const db = admin as any',
      ].join('\n'),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].accepted).toBe(true)
  })

  it('ignores prose about any inside a comment', () => {
    // src/server/payments/payment-events.ts:29 explains why there is NO cast.
    const hits = scanAnyTypes(
      ['/**', ' * visible rather than hidden behind an `as any` at the call site', ' */'].join(
        '\n',
      ),
    )
    expect(hits).toEqual([])
  })
})

describe('scanConsole', () => {
  it('finds a call', () => {
    expect(scanConsole("console.error('boom')\n")).toHaveLength(1)
  })

  it('ignores the logger doc comment that quotes the calls it replaced', () => {
    // src/lib/observability/log.ts:9.
    const hits = scanConsole(
      ['/**', " * over were `console.error('search DLQ insert failed:', e)` and", ' */'].join('\n'),
    )
    expect(hits).toEqual([])
  })
})

describe('scanEnvReads', () => {
  it('reads all three access shapes', () => {
    const names = scanEnvReads(
      [
        'const a = process.env.CARDCOM_TIMEOUT_MS',
        "const b = process.env['R2_BUCKET']",
        'const c = source.CARDCOM_ACCOUNTS',
        'const d = env.SUPABASE_TIMEOUT_MS',
      ].join('\n'),
    )
    expect([...names].sort()).toEqual([
      'CARDCOM_ACCOUNTS',
      'CARDCOM_TIMEOUT_MS',
      'R2_BUCKET',
      'SUPABASE_TIMEOUT_MS',
    ])
  })

  it('does not read a static off an unrelated object', () => {
    expect([...scanEnvReads('const n = Number.MAX_SAFE_INTEGER\n')]).toEqual([])
  })

  it('does not read a variable out of a comment', () => {
    // src/lib/push/expo.test.ts:17 explains that `process.env.X = undefined`
    // stores the STRING "undefined". X is not configuration.
    expect([
      ...scanEnvReads('  // stubEnv, not assignment: `process.env.X = undefined` stores\n'),
    ]).toEqual([])
  })
})

describe('parseEnvExample', () => {
  it('counts a plain entry, a commented entry and a tagged entry', () => {
    const names = parseEnvExample(
      ['CRON_SECRET=', '# VOUCHER_QR_SECRET_PREVIOUS=', '# [optional] R2_BUCKET='].join('\n'),
    )
    expect([...names].sort()).toEqual(['CRON_SECRET', 'R2_BUCKET', 'VOUCHER_QR_SECRET_PREVIOUS'])
  })

  it('does not read a name out of prose that happens to end in =', () => {
    const names = parseEnvExample('# string is NOT nullish, so `CARDCOM_API_BASE_URL=` differs\n')
    expect([...names]).toEqual([])
  })
})

describe('commentLineNumbers', () => {
  it('spans a block comment', () => {
    expect([...commentLineNumbers('/**\n * hi\n */\nconst a = 1\n')]).toEqual([1, 2, 3])
  })
})

describe('PLATFORM_ENV', () => {
  it('holds the names Vercel and the runner inject', () => {
    expect(PLATFORM_ENV.has('NODE_ENV')).toBe(true)
    expect(PLATFORM_ENV.has('VERCEL_ENV')).toBe(true)
    expect(PLATFORM_ENV.has('CRON_SECRET')).toBe(false)
  })
})
