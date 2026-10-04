import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The five legal URLs the launch checklist names must all resolve.
 *
 * Four of them are aliases, not pages, and that is the point. The policies
 * live at the WordPress paths the footer, existing links and indexed search
 * results already point at:
 *
 *   /cancellation-policy -> /refund_returns
 *   /terms               -> /terms-and-conditions
 *   /privacy             -> /privacy-policy
 *   /returns             -> /refund_returns
 *
 * /cookies is the exception: it IS a page (`src/app/(store)/cookies`), the
 * fifth document, born at the short path because no WordPress path ever held
 * a cookie policy. Until W02 (05.10.2026) it was an alias onto the cookies
 * section of the privacy document; a redirect runs before file routing, so a
 * leftover alias would make the page unreachable. The last block below holds
 * that it stays out of next.config.ts.
 *
 * A second PAGE for the same policy is the failure this avoids. Two routes
 * rendering one cancellation policy drift, and then the site states two
 * different sets of terms about a consumer's right to cancel, which is exactly
 * the kind of contradiction the Consumer Protection Law makes expensive.
 *
 * Asserted against next.config.ts rather than by booting a server, so it fails
 * in CI in milliseconds and names the file.
 */
const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

const ALIASES: ReadonlyArray<[string, string]> = [
  ['/cancellation-policy', '/refund_returns'],
  ['/terms', '/terms-and-conditions'],
  ['/privacy', '/privacy-policy'],
  ['/returns', '/refund_returns'],
]

describe('legal route aliases', () => {
  it.each(ALIASES)('%s redirects to %s', (source, destination) => {
    const pattern = new RegExp(
      `source:\\s*'${source}'\\s*,\\s*destination:\\s*'${destination}'\\s*,\\s*permanent:\\s*true`,
    )
    expect(config).toMatch(pattern)
  })

  it('keeps them permanent, so the canonical stays on the real path', () => {
    // A temporary redirect would leave both URLs indexable and split the
    // policy's search presence across two addresses.
    for (const [source] of ALIASES) {
      const line = config.split('\n').find((l) => l.includes(`source: '${source}'`))
      expect(line, `${source} missing from next.config.ts`).toBeDefined()
      expect(line).toContain('permanent: true')
    }
  })
})

describe('the cookie policy is a page, not an alias', () => {
  it('has no redirect in next.config.ts, which would shadow the page', () => {
    expect(config).not.toMatch(/source:\s*'\/cookies'/)
  })

  it('exists where the footer and the checkout consent sentence point', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/(store)/cookies/page.tsx'), 'utf8')
    expect(page).toContain("getLegalDoc('cookies')")
    expect(page).toContain('ConsentWithdrawForm')
  })
})
