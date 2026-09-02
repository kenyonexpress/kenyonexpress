import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  MAX_FIRST_LOAD_GZ,
  entryJsFromClientReference,
  gzipSize,
  measureFirstLoad,
} from '../../scripts/bundle-gate.mjs'
import {
  A11Y_MIN,
  SEO_MIN,
  failedBinaryAudits,
  gatedCategoryScore,
  parseRobotsDisallow,
  rewriteToMeasuredOrigin,
  robotsDisallows,
} from '../../scripts/lighthouse-ci.mjs'
import {
  PRODUCTION_PROJECT_REF,
  inspectSql,
  parseApplyOrder,
} from '../../scripts/migration-dry-run.mjs'
import { SECRET_ENV_NAMES, findingsInText, scanTrackedFiles } from '../../scripts/secrets-audit.mjs'

describe('migration dry-run helpers', () => {
  it('rejects DROP DATABASE', () => {
    expect(inspectSql('x.sql', 'DROP DATABASE production;')).not.toEqual([])
  })

  it('accepts an ordinary idempotent statement', () => {
    expect(inspectSql('x.sql', 'create table if not exists t (id int);')).toEqual([])
  })

  it('parses Remaining and Already applied sections', () => {
    const text = [
      '## Remaining (apply in this order)',
      '',
      '| 1 | `122_deny_all_on_server_only_tables.sql` | x | y |',
      '',
      '## Already applied (do not apply again)',
      '',
      '| `123_products_whatsapp_enabled.sql` | v |',
    ].join('\n')
    expect(parseApplyOrder(text)).toEqual({
      remaining: ['122_deny_all_on_server_only_tables.sql'],
      applied: ['123_products_whatsapp_enabled.sql'],
    })
  })

  it('names the production project so a live dry-run cannot aim at it by accident', () => {
    expect(PRODUCTION_PROJECT_REF).toBe('ixvwfbuvfxxsjiywhbbb')
  })
})

describe('bundle gate', () => {
  it('keeps the 180KB gz ceiling (not raised to make a fat graph pass)', () => {
    expect(MAX_FIRST_LOAD_GZ).toBe(180 * 1024)
  })

  it('parses entryJSFiles from a Next 16 client-reference manifest', () => {
    const text = `globalThis.__RSC_MANIFEST["/(store)/checkout/page"] = {"entryCSSFiles":{"[project]/src/app/(store)/checkout/page":[{"path":"static/chunks/x.css"}]},"entryJSFiles":{"[project]/src/app/(store)/checkout/page":["static/chunks/a.js","static/chunks/b.js"]}};`
    expect(entryJsFromClientReference(text, '(store)/checkout/page')).toEqual([
      'static/chunks/a.js',
      'static/chunks/b.js',
    ])
  })

  it('gzipSize matches zlib', () => {
    const buf = Buffer.from('hello kenyon')
    expect(gzipSize(buf)).toBe(gzipSync(buf).length)
  })

  it('fails a fixture route whose gz JS is over the ceiling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-gate-'))
    mkdirSync(join(dir, 'static', 'chunks'), { recursive: true })
    const payload = randomBytes(250 * 1024)
    writeFileSync(join(dir, 'static', 'chunks', 'page.js'), payload)
    writeFileSync(
      join(dir, 'app-build-manifest.json'),
      JSON.stringify({ pages: { '/product/[slug]/page': ['static/chunks/page.js'] } }),
    )
    const result = measureFirstLoad(dir)
    expect(result.ok).toBe(false)
    expect(result.over[0]?.route).toContain('product')
  })

  it('does not count Next runtime toward the 180KB first-load gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-gate-'))
    mkdirSync(join(dir, 'static', 'chunks'), { recursive: true })
    mkdirSync(join(dir, 'server/app/(store)/checkout'), { recursive: true })
    mkdirSync(join(dir, 'server/app/(store)/product/[slug]'), { recursive: true })
    writeFileSync(join(dir, 'static', 'chunks', 'tiny-checkout.js'), randomBytes(40 * 1024))
    writeFileSync(join(dir, 'static', 'chunks', 'tiny-product.js'), randomBytes(40 * 1024))
    writeFileSync(join(dir, 'static', 'chunks', 'huge-runtime.js'), randomBytes(200 * 1024))
    writeFileSync(
      join(dir, 'build-manifest.json'),
      JSON.stringify({
        rootMainFiles: ['static/chunks/huge-runtime.js'],
        polyfillFiles: [],
      }),
    )
    writeFileSync(
      join(dir, 'server/app/(store)/checkout/page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST["/(store)/checkout/page"] = {"entryJSFiles":{"[project]/src/app/(store)/checkout/page":["static/chunks/tiny-checkout.js"]}};`,
    )
    writeFileSync(
      join(dir, 'server/app/(store)/product/[slug]/page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST["/(store)/product/[slug]/page"] = {"entryJSFiles":{"[project]/src/app/(store)/product/[slug]/page":["static/chunks/tiny-product.js"]}};`,
    )
    const result = measureFirstLoad(dir)
    expect(result.ok).toBe(true)
    expect(result.runtime.gz).toBeGreaterThan(180 * 1024)
    expect(result.routes.every((r) => r.gz < 180 * 1024)).toBe(true)
  })

  it('stages Next output into a visible directory because upload-artifact skips .next', () => {
    const yml = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    expect(yml).toMatch(/Stage Next output for the bundle gate/)
    expect(yml).toMatch(/next-ci-out/)
    expect(yml).toMatch(/if-no-files-found: error/)
  })
})

describe('lighthouse floors', () => {
  it('requires a11y and SEO strictly above 95 (integer 96)', () => {
    expect(A11Y_MIN).toBe(96)
    expect(SEO_MIN).toBe(96)
  })

  it('treats /checkout as disallowed when robots.txt says so', () => {
    const disallow = parseRobotsDisallow('User-agent: *\nDisallow: /checkout\nDisallow: /cart\n')
    expect(robotsDisallows(disallow, '/checkout')).toBe(true)
    expect(robotsDisallows(disallow, '/product/airpods')).toBe(false)
  })

  it('rewrites a sitemap loc on another host onto the measured origin', () => {
    expect(
      rewriteToMeasuredOrigin(
        'https://kenyonexpress.co.il/product/barbecue/',
        'https://kenyonexpress.vercel.app',
      ),
    ).toBe('https://kenyonexpress.vercel.app/product/barbecue/')
    expect(rewriteToMeasuredOrigin('/product/airpods', 'https://kenyonexpress.vercel.app/')).toBe(
      'https://kenyonexpress.vercel.app/product/airpods',
    )
  })

  it('lists failed binary a11y audits', () => {
    const report = {
      categories: {
        accessibility: {
          auditRefs: [{ id: 'color-contrast' }, { id: 'document-title' }],
        },
      },
      audits: {
        'color-contrast': { score: 0, scoreDisplayMode: 'binary' },
        'document-title': { score: 1, scoreDisplayMode: 'binary' },
      },
    }
    expect(failedBinaryAudits(report, 'accessibility')).toEqual(['color-contrast'])
  })

  it('drops is-crawlable from SEO only when asked', () => {
    const report = {
      categories: {
        seo: {
          score: 0.69,
          auditRefs: [
            { id: 'is-crawlable', weight: 7 },
            { id: 'meta-description', weight: 1 },
            { id: 'document-title', weight: 1 },
          ],
        },
      },
      audits: {
        'is-crawlable': { score: 0 },
        'meta-description': { score: 1 },
        'document-title': { score: 1 },
      },
    }
    expect(gatedCategoryScore(report, 'seo')).toBe(22)
    expect(gatedCategoryScore(report, 'seo', { dropAuditIds: ['is-crawlable'] })).toBe(100)
  })
})

describe('secrets audit', () => {
  it('lists every name ARCHITECTURE-TESTING.md 7.4 greps for', () => {
    for (const name of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
      'CARDCOM_API_PASSWORD',
      'CARDCOM_WEBHOOK_SECRET',
      'VOUCHER_QR_SECRET',
      'R2_SECRET_ACCESS_KEY',
      'MEILISEARCH_API_KEY',
      'CRON_SECRET',
    ]) {
      expect(SECRET_ENV_NAMES).toContain(name)
    }
  })

  it('flags a service_role JWT that is not the public demo key', () => {
    const payload = Buffer.from(JSON.stringify({ iss: 'supabase', role: 'service_role' })).toString(
      'base64url',
    )
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const jwt = `${header}.${payload}.sig`
    const hits = findingsInText('src/leak.ts', `const k = '${jwt}'`)
    expect(hits.some((h) => h.includes('service_role JWT'))).toBe(true)
  })

  it('does not flag the supabase-demo JWT', () => {
    const payload = Buffer.from(
      JSON.stringify({ iss: 'supabase-demo', role: 'service_role' }),
    ).toString('base64url')
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
    const jwt = `${header}.${payload}.sig`
    expect(findingsInText('src/ok.ts', `const k = '${jwt}'`)).toEqual([])
  })

  it('flags a private key block and ignores an empty assignment', () => {
    expect(findingsInText('k.pem', '-----BEGIN PRIVATE KEY-----\nMIIB\n').length).toBeGreaterThan(0)
    expect(findingsInText('.env.local', 'CRON_SECRET=\n')).toEqual([])
  })

  it('treats angle-bracket and ellipsis values as placeholders', () => {
    expect(
      findingsInText('.env.test', 'SUPABASE_SECRET_KEY=<service-role-key-never-commit-this>\n'),
    ).toEqual([])
    expect(findingsInText('scripts/db-doc.mjs', 'SUPABASE_DB_URL=postgresql://...\n')).toEqual([])
  })

  it('does not flag wallet test private-key stubs', () => {
    expect(
      findingsInText(
        'src/lib/wallet/config.test.ts',
        "const KEY = '-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----'\n",
      ),
    ).toEqual([])
  })

  it('does not treat a voucher KEV1 token as a JWT leak', () => {
    const files = ['src/lib/vouchers/scan-input.test.ts']
    const hits = scanTrackedFiles(files, () => "const TOKEN = 'KEV1.eyJ2IjoxfQ.bWFj'\n")
    expect(hits).toEqual([])
  })
})
