import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PLATFORM_ENV,
  SUBJECT_MAX,
  applySubjectLedger,
  classifyCommitSubject,
  commentLineNumbers,
  findUnimportedComponents,
  parseEnvExample,
  scanAnyTypes,
  scanConsole,
  scanEnvReads,
  scanMarkers,
  scanReadmeScriptCoverage,
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

/**
 * Every subject below is a real one from this repo's history, chosen because it
 * sits on a boundary the gate has to get right.
 */
describe('classifyCommitSubject', () => {
  it('accepts a conventional subject with a scope', () => {
    const v = classifyCommitSubject(
      'feat(audit): FINAL-AUDIT gate, 43 undocumented env vars closed',
    )
    expect(v.ok).toBe(true)
    expect(v.type).toBe('feat')
  })

  it('exempts the subject the GitHub merge button writes', () => {
    // 3fbf461c5. Nobody typed this and nobody can change it, so grading it would
    // only produce a permanently red gate.
    const v = classifyCommitSubject(
      'Merge pull request #43 from kenyonexpress/docs/nightly-health-green',
    )
    expect(v.kind).toBe('generated')
    expect(v.ok).toBe(true)
  })

  it('exempts the subject git revert writes', () => {
    expect(classifyCommitSubject('Revert "feat(cart): optimistic quantity"').ok).toBe(true)
  })

  it('names the bot prefix rather than calling the subject unrecognised', () => {
    // 39 commits look like this. The conventional subject is intact underneath,
    // so "drop the prefix" is the actionable report and "not type(scope):" is not.
    const v = classifyCommitSubject(
      '[autopilot] docs(state): backup strategy done, all my gates green',
    )
    expect(v.ok).toBe(false)
    expect(v.type).toBe('docs')
    expect(v.reasons).toEqual(['bot prefix [autopilot]'])
  })

  it('rejects the merge bot subject on both counts', () => {
    const v = classifyCommitSubject('[auto-merger] merge autopilot (3 commits, 2026-09-08T03:36)')
    expect(v.reasons).toEqual(['bot prefix [auto-merger]', 'not type(scope): description'])
  })

  it('rejects a bare sentence with no type at all', () => {
    expect(classifyCommitSubject('autopilot residual').ok).toBe(false)
    expect(classifyCommitSubject('update STATE.md').ok).toBe(false)
  })

  it('reports the ad-hoc types this repo invented, by name', () => {
    // 57 `merge...:` and 12 `wip...:` are the two biggest. Naming the type in the
    // reason is what makes the report tell you which convention to fix.
    expect(
      classifyCommitSubject('merge(docs): the v1-final documentation branch, 170 files').reasons,
    ).toEqual(['unknown type "merge"'])
    expect(classifyCommitSubject('wip(autosave): periodic save 20260902-1957').reasons).toEqual([
      'unknown type "wip"',
    ])
  })

  it('does not fight the house style at 72 characters', () => {
    // 2539853c5 is 105 chars. p50 here is 70 and p95 is 104: long descriptive
    // subjects are the convention, not the exception, and a 72 ceiling would fail
    // a quarter of the history for conforming to it.
    const subject =
      'docs(state): nightly-health was red three nights, and the written explanation covered three of four gates'
    expect(subject.length).toBeGreaterThan(72)
    expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX)
    expect(classifyCommitSubject(subject).ok).toBe(true)
  })

  it('rejects a paragraph pasted into the subject line', () => {
    // The longest subject in this history is 946 characters. That is the thing
    // that actually makes `git log --oneline` unreadable.
    const v = classifyCommitSubject(`feat(dr): ${'x'.repeat(SUBJECT_MAX)}`)
    expect(v.ok).toBe(false)
    expect(v.reasons[0]).toMatch(/over 120/)
  })
})

describe('applySubjectLedger', () => {
  const bad = { sha: 'a'.repeat(40), subject: 'state: a loop wrote this' }
  const good = { sha: 'b'.repeat(40), subject: 'fix(cart): a quantity of zero removed the line' }

  it('refuses a malformed subject the ledger does not name', () => {
    const { malformed, staleLedger } = applySubjectLedger([bad, good], {})
    expect(malformed.map((m) => m.sha)).toEqual(['aaaaaaaaa'])
    expect(malformed[0].reasons).toContain('unknown type "state"')
    expect(staleLedger).toEqual([])
  })

  it('lets a frozen SHA through without letting its shape through', () => {
    const twin = { sha: 'c'.repeat(40), subject: bad.subject }
    const { malformed } = applySubjectLedger([bad, twin], { [bad.sha]: { subject: bad.subject } })
    // Same text, different commit: the exemption is not transferable, which is
    // the one property that keeps a loop from minting its own exemptions.
    expect(malformed.map((m) => m.sha)).toEqual(['ccccccccc'])
  })

  it('fails on a ledger entry that has fallen out of range', () => {
    const { malformed, staleLedger } = applySubjectLedger([good], {
      [bad.sha]: { subject: bad.subject },
    })
    expect(malformed).toEqual([])
    expect(staleLedger).toEqual([{ sha: 'aaaaaaaaa', subject: bad.subject }])
  })

  it('reports how many it is carrying, so a green row is not read as a clean history', () => {
    const { frozenCount } = applySubjectLedger([good], { x: {}, y: {} })
    expect(frozenCount).toBe(2)
  })
})

describe('the committed frozen-subject ledger', () => {
  const ledger = JSON.parse(readFileSync('scripts/git-subject-known-issues.json', 'utf8'))

  it('keys every entry by a full 40-character SHA', () => {
    // A short SHA would silently never match: the gate compares against %H.
    for (const sha of Object.keys(ledger.known)) expect(sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('records a subject that really is malformed, for the reasons it claims', () => {
    // Otherwise the file could exempt a conforming commit and nobody would know,
    // because an exemption that is not needed produces no output at all.
    for (const [sha, entry] of Object.entries(ledger.known)) {
      const verdict = classifyCommitSubject(entry.subject)
      expect(verdict.ok, `${sha} is exempted but conforms`).toBe(false)
      expect(verdict.reasons).toEqual(entry.reasons)
    }
  })
})

describe('scanReadmeScriptCoverage', () => {
  it('counts a script whose name the README prints', () => {
    const { uncovered } = scanReadmeScriptCoverage(
      { test: 'vitest run' },
      'run `pnpm test` before pushing',
    )
    expect(uncovered).toEqual([])
  })

  it('lets a flag variant ride on its family row', () => {
    // `pnpm seed` documented; seed:sql is the same command with --sql, and a
    // row of its own would teach nothing.
    const { uncovered } = scanReadmeScriptCoverage(
      { seed: 'node scripts/seed.mjs', 'seed:sql': 'node scripts/seed.mjs --sql' },
      '| `pnpm seed` | seeds the catalogue |',
    )
    expect(uncovered).toEqual([])
  })

  it('lets an alias ride on the documented script that already runs its file', () => {
    // This is the real `lint` / `lint:copy` shape: the umbrella runs the gate
    // inline, so the alias is a shortcut to something already described.
    const { uncovered } = scanReadmeScriptCoverage(
      {
        lint: 'biome check . && node scripts/copy-gate.mjs',
        'lint:copy': 'node scripts/copy-gate.mjs',
      },
      '| `pnpm lint` | biome plus the copy gate |',
    )
    expect(uncovered).toEqual([])
  })

  it('does not let seed:sql ride on a seed:test row', () => {
    // `seed:test` is a different command, and matching it as the family of
    // `seed:sql` would have hidden six real seeding commands. It did, in the
    // first draft of this rule.
    const { uncovered } = scanReadmeScriptCoverage(
      { 'seed:test': 'node scripts/seed-test.mjs', 'seed:sql': 'node scripts/seed.mjs --sql' },
      '| `pnpm seed:test` | test data |',
    )
    expect(uncovered.map((u) => u.script)).toEqual(['seed:sql'])
  })

  it('reports a script that runs no local file and is named nowhere', () => {
    const { uncovered } = scanReadmeScriptCoverage({ analyze: 'next experimental-analyze' }, '')
    expect(uncovered.map((u) => u.script)).toEqual(['analyze'])
  })

  it('exempts prepare, and nothing else', () => {
    const { uncovered } = scanReadmeScriptCoverage(
      { prepare: 'husky || true', postinstall: 'husky || true' },
      '',
    )
    expect(uncovered.map((u) => u.script)).toEqual(['postinstall'])
  })
})

describe('findUnimportedComponents', () => {
  const scan = (files) =>
    findUnimportedComponents(
      Object.keys(files).filter((f) => f.startsWith('src/components/')),
      Object.keys(files),
      (f) => files[f],
    )

  it('finds a component nothing imports', () => {
    expect(
      scan({
        'src/components/Orphan.tsx': 'export default function Orphan() {}',
        'src/app/page.tsx': "import Live from '@/components/Live'",
      }),
    ).toEqual(['src/components/Orphan.tsx'])
  })

  it('does not let a file vouch for itself through a package of the same name', () => {
    // ui/dropdown-menu.tsx imports @radix-ui/react-dropdown-menu. A pattern of
    // "any path ending in dropdown-menu" reads that as its own importer, and
    // the file disappeared from the findings when it did.
    expect(
      scan({
        'src/components/ui/dropdown-menu.tsx': "import * as P from '@radix-ui/react-dropdown-menu'",
      }),
    ).toEqual(['src/components/ui/dropdown-menu.tsx'])
  })

  it('does not let a longer name vouch for a shorter one', () => {
    // Matching a bare basename makes `Footer` a substring of `SiteFooter`, so a
    // live component would sign off on a dead one.
    expect(
      scan({
        'src/components/home/Footer.tsx': 'export default function Footer() {}',
        'src/app/layout.tsx': "import SiteFooter from '@/components/layout/SiteFooter'",
        'src/components/layout/SiteFooter.tsx': 'export default function SiteFooter() {}',
      }),
    ).toEqual(['src/components/home/Footer.tsx'])
  })

  it('counts a dynamic import as an import', () => {
    expect(
      scan({
        'src/components/Heavy.tsx': 'export default function Heavy() {}',
        'src/app/page.tsx': "const H = dynamic(() => import('@/components/Heavy'))",
      }),
    ).toEqual([])
  })
})

describe('the committed dead-component ledger', () => {
  const ledger = JSON.parse(readFileSync('scripts/dead-component-known-issues.json', 'utf8'))

  it('names a file that exists, for every entry', () => {
    // An entry for a deleted file is a stale exemption, and the gate says so at
    // runtime. This says so at test time, which is where it is cheaper.
    for (const file of Object.keys(ledger.known)) {
      expect(existsSync(file), `${file} is in the ledger and not on disk`).toBe(true)
    }
  })

  it('gives every entry a group and a detail, not just a name', () => {
    // The list is meant to shrink, and nobody shrinks a list of bare paths:
    // the reason a component is still here is what tells you whether to wire it
    // up or delete it.
    for (const [file, entry] of Object.entries(ledger.known)) {
      expect(entry.group, file).toBeTruthy()
      expect(entry.detail?.length ?? 0, file).toBeGreaterThan(20)
    }
  })
})
