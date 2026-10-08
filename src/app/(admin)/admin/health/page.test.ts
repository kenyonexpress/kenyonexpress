import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PRIMARY_SERVICES } from '@/lib/health/services'
import { describe, expect, it } from 'vitest'

/**
 * /admin/health (STEP 67), read as source. The page is an async server
 * component behind `requireSection`, so it is not rendered here; what this
 * file holds is the shape that keeps it honest:
 *
 *   - it is behind the dashboard gate, the same one `/admin/status` wore;
 *   - every service the brief names has a card, and the card names are the
 *     check names in `checks.ts`, so a renamed check is a red card and not a
 *     missing one;
 *   - it is never cached: a health page from a cache is a lie with a
 *     timestamp;
 *   - the old `/admin/status` path redirects here rather than 404ing during
 *     an outage.
 */

const PAGE = readFileSync(resolve(process.cwd(), 'src/app/(admin)/admin/health/page.tsx'), 'utf8')
const STATUS = readFileSync(resolve(process.cwd(), 'src/app/(admin)/admin/status/page.tsx'), 'utf8')
const CHECKS = readFileSync(resolve(process.cwd(), 'src/lib/health/checks.ts'), 'utf8')

describe('/admin/health', () => {
  it('is behind the dashboard section gate', () => {
    expect(PAGE).toMatch(/await requireSection\('dashboard'\)/)
  })

  it('runs the checks live and reads the incident log, with no cache directive', () => {
    expect(PAGE).toContain('runHealthChecks(')
    expect(PAGE).toContain('listIncidents(')
    expect(PAGE).not.toMatch(/['"]use cache['"]/)
    expect(PAGE).not.toContain('cacheLife(')
  })

  it('names the six services the brief asks for, each as a check that exists', () => {
    const names = PRIMARY_SERVICES.map((s) => s.name)
    expect(names).toEqual(['database', 'storage', 'search', 'email', 'twilio', 'cardcom'])
    for (const name of names) {
      expect(CHECKS).toContain(`name: '${name}'`)
    }
    for (const vendor of ['R2', 'Meilisearch', 'Resend', 'Twilio', 'Cardcom']) {
      expect(PRIMARY_SERVICES.some((s) => s.vendor.includes(vendor))).toBe(true)
    }
  })

  it('says when the incident table is pending instead of showing an empty log as clean', () => {
    expect(PAGE).toContain('incidents-pending')
    expect(PAGE).toContain('269')
    expect(PAGE).toContain('incidents-empty')
  })

  it('uses logical alignment, not physical', () => {
    expect(PAGE).not.toMatch(/text-right|text-left|ml-|mr-|pl-|pr-/)
  })

  it('keeps /admin/status as a permanent redirect here', () => {
    expect(STATUS).toContain("permanentRedirect('/admin/health')")
  })
})
