import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The four legal URLs the launch checklist names must all resolve.
 *
 * Three of them are aliases, not pages, and that is the point. The policies
 * live at the WordPress paths the footer, existing links and indexed search
 * results already point at:
 *
 *   /cancellation-policy -> /refund_returns
 *   /terms               -> /terms-and-conditions
 *   /privacy             -> /privacy-policy
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
