import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every query in the app is parameterized, and the shapes that would not be
 * are refused at the source.
 *
 * There are three query paths here and each has one way to smuggle text into
 * syntax:
 *
 *   PostgREST filters   `.eq(col, value)` sends the value as a URL parameter
 *                       and is safe by construction. `.or('expr')` and the
 *                       pattern argument of `.ilike()` are the two places a
 *                       string becomes syntax: in an `.or()` expression
 *                       `, ( ) " \` are structural, and in a LIKE pattern
 *                       `% _ *` are wildcards.
 *   RPC                 `.rpc('name', { args })` is parameterized; the name
 *                       must be a literal so the callable set is the source.
 *   Raw SQL             `sql\`...\`` (drizzle, postgres.js) parameterizes every
 *                       `${}`; `sql.raw()` and `.unsafe()` do not.
 *
 * `src/__tests__/admin-or-filters-are-sanitised.test.ts` pins the admin pages
 * against the first of these with a narrower rule; this file is the same
 * idea over the whole of `src/` and all three paths.
 */

const ROOT = process.cwd()

function sourcesUnder(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path, source: readFileSync(resolve(ROOT, path), 'utf8') })
    }
  }
  return out
}

const SOURCES = sourcesUnder('src').filter(({ path }) => !path.startsWith('src/types/'))

function line(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

/** `.or(\`...${name}...\`)`: every interpolated identifier inside the template. */
const OR_TEMPLATE = /\.or\(\s*`([^`]*)`/g
const INTERPOLATION = /\$\{\s*([A-Za-z_$][\w$.]*)\s*\}/g

/** The sanitiser, and the local alias two search modules give it. */
const OR_SANITISERS = ['sanitizeOrTerm', 'sanitize']

/**
 * Interpolations whose value is not a user string at all, each pinned to the
 * producer that makes it safe. The guard is a regex the file must still
 * match: if the producer changes, the entry stops covering the site and the
 * test fails there rather than staying green on a stale reason.
 */
const TRUSTED_INTERPOLATIONS: {
  path: string
  name: string
  reason: string
  guard: RegExp
}[] = [
  {
    path: 'src/app/api/cron/notifications/route.ts',
    name: 'now',
    reason: 'the server clock as ISO 8601, nothing from the request',
    guard: /const now = new Date\(\)\.toISOString\(\)/,
  },
  {
    path: 'src/lib/category-page.ts',
    name: 'facet.value',
    reason: 'productTypeFilter() returns one of two constant expressions',
    guard: /const facet = productTypeFilter\(productType\)/,
  },
  {
    path: 'src/lib/search/faceted-server.ts',
    name: 'word',
    reason: 'a word of params.q, which is sanitizeOrTerm(input.q) before the query is built',
    guard: /q: sanitizeOrTerm\(input\.q\)/,
  },
  {
    path: 'src/lib/search-server.ts',
    name: 'word',
    reason: 'a word of q, which the only caller sanitises first (const q = sanitize(query))',
    guard: /const q = sanitize\(query\)/,
  },
  {
    path: 'src/server/queries/referrals.ts',
    name: 'user.id',
    reason: 'the JWT subject from supabase.auth.getUser(), a UUID the server verified',
    guard: /\} = await supabase\.auth\.getUser\(\)/,
  },
]

describe('.or() expressions', () => {
  const sites: { path: string; line: number; template: string; names: string[] }[] = []
  for (const { path, source } of SOURCES) {
    for (const match of source.matchAll(OR_TEMPLATE)) {
      const template = match[1] ?? ''
      const names = [...template.matchAll(INTERPOLATION)].map((m) => m[1] ?? '')
      if (names.length > 0) {
        sites.push({ path, line: line(source, match.index), template, names })
      }
    }
  }

  it('finds the interpolating sites at all', () => {
    expect(sites.length).toBeGreaterThanOrEqual(2)
  })

  it('every trusted entry still points at a site that exists', () => {
    for (const entry of TRUSTED_INTERPOLATIONS) {
      const covers = sites.some((s) => s.path === entry.path && s.names.includes(entry.name))
      expect(
        covers,
        `${entry.path} no longer interpolates \${${entry.name}}; drop the entry.`,
      ).toBe(true)
    }
  })

  it.each(sites.map((s) => [`${s.path}:${s.line}`, s] as const))(
    '%s interpolates only sanitised terms',
    (_label, site) => {
      const source = SOURCES.find((s) => s.path === site.path)?.source ?? ''
      for (const name of site.names) {
        const base = name.split('.')[0]
        const trusted = TRUSTED_INTERPOLATIONS.find(
          (entry) => entry.path === site.path && entry.name === name,
        )
        if (trusted) {
          expect(
            trusted.guard.test(source),
            `${site.path} no longer matches the guard for \${${name}} (${trusted.reason}); re-check the producer.`,
          ).toBe(true)
          continue
        }
        // `const x = sanitizeOrTerm(raw)` and `const x = raw ? sanitizeOrTerm(raw) : ''`
        // both count: the declaration statement names the sanitiser.
        const declaredSanitised = OR_SANITISERS.some((fn) =>
          new RegExp(`(?:const|let)\\s+${base}\\s*=[^\\n;]*\\b${fn}\\(`).test(source),
        )
        expect(
          declaredSanitised,
          `${site.path}:${site.line} puts \${${name}} into an .or() expression, and ${base} is not the result of sanitizeOrTerm(). In that expression , ( ) " and \\ are syntax. Either sanitise it or add a TRUSTED_INTERPOLATIONS entry with a guard.`,
        ).toBe(true)
      }
    },
  )
})

/**
 * `.ilike(col, \`...${x}...\`)` and `.like(...)` with any interpolation other
 * than `escapeLikePattern(...)`, plus the concatenated form.
 */
const LIKE_TEMPLATE = /\.i?like\(\s*'[^']*'\s*,\s*`[^`]*\$\{(?!\s*escapeLikePattern\()/g
const LIKE_CONCAT = /\.i?like\(\s*'[^']*'\s*,\s*(?:'%'\s*\+|[\w.]+\s*\+\s*'%')/g

describe('LIKE patterns', () => {
  it('never build the pattern by interpolation; likeContains() escapes the wildcards', () => {
    const offenders: string[] = []
    for (const { path, source } of SOURCES) {
      for (const match of source.matchAll(LIKE_TEMPLATE)) {
        offenders.push(`${path}:${line(source, match.index)}`)
      }
      for (const match of source.matchAll(LIKE_CONCAT)) {
        offenders.push(`${path}:${line(source, match.index)}`)
      }
    }
    expect(
      offenders,
      'A LIKE pattern built from a raw term lets % and _ act as wildcards. Use likeContains() or escapeLikePattern() from @/lib/utils/search-escape.',
    ).toEqual([])
  })
})

describe('RPC names are literals', () => {
  it('no .rpc() takes a computed name', () => {
    const offenders: string[] = []
    for (const { path, source } of SOURCES) {
      for (const match of source.matchAll(/\w\.rpc\(\s*(?![\s'"])([^,)]+)/g)) {
        const arg = (match[1] ?? '').trim()
        // `'name' as never` is the shape for a function outside the generated
        // types; it is still a literal. `pendingXRpc('name')` is the typed
        // wrapper for the same case: its parameter is a union of literals, and
        // a caller that forwards a parameter of that same type is covered by it.
        if (/^`[^$`]*`/.test(arg)) continue
        // `supabase.rpc(...)` inside a doc comment is prose, not a call.
        if (arg === '...') continue
        if (/^pending\w*Rpc\(\s*(?:['"]|$)/.test(arg)) continue
        if (
          /^pending\w*Rpc\(\s*rpcName$/.test(arg) &&
          /rpcName: Parameters<typeof pending\w*Rpc>\[0\]/.test(source)
        ) {
          continue
        }
        offenders.push(`${path}:${line(source, match.index)}: ${arg}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('raw SQL', () => {
  it('no sql.raw(), .unsafe() or string-built statement anywhere in src/', () => {
    const offenders: string[] = []
    for (const { path, source } of SOURCES) {
      for (const match of source.matchAll(/\bsql\.raw\(|\.unsafe\(|\bsql\.unsafe\b/g)) {
        offenders.push(`${path}:${line(source, match.index)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
