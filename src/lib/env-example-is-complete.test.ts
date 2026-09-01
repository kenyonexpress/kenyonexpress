import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `.env.example` promises, in its own header:
 *
 *   "If something reads a variable, it is listed."
 *
 * Nothing enforced that, and it drifted the first time somebody added a reader.
 * The rate-limit layer landed three variables in `src/lib/env.ts` -
 * UPSTASH_REDIS_REST_URL, _TOKEN and _TIMEOUT_MS - and `.env.example` mentioned
 * none of them. The file still claimed to be exhaustive, which is worse than
 * being silent: an operator provisioning a new environment reads it as the
 * complete list and provisions a rate limiter that quietly stays on the
 * fallback.
 *
 * This checks the declared contract rather than every `process.env` read in the
 * repo, because `src/lib/env.ts` IS the contract: it is the schema the app
 * validates its environment against at boot. A variable that matters enough to
 * be in that schema matters enough to be documented.
 *
 * A commented line counts. Most of `.env.example` is commented out on purpose,
 * because an uncommented empty value and an absent line mean different things
 * to a shell that sources the file.
 */

const ENV_TS = resolve(process.cwd(), 'src/lib/env.ts')
const ENV_EXAMPLE = resolve(process.cwd(), '.env.example')

/** The keys declared in the zod object in `src/lib/env.ts`. */
function schemaKeys(): string[] {
  const source = readFileSync(ENV_TS, 'utf8')
  // `    NAME: z.` at the start of a line, which is how every entry is written.
  const keys = [...source.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):\s*z\./gm)]
    .map((m) => m[1])
    .filter((k): k is string => typeof k === 'string')
  return [...new Set(keys)].sort()
}

describe('.env.example lists every variable the boot schema declares', () => {
  it('finds the schema keys at all, so a broken scan cannot pass silently', () => {
    // Without this, a refactor of env.ts that changes the formatting would make
    // the scan return nothing and the real assertion below would pass vacuously.
    const keys = schemaKeys()
    expect(keys.length).toBeGreaterThan(10)
    expect(keys).toContain('CRON_SECRET')
    expect(keys).toContain('UPSTASH_REDIS_REST_URL')
  })

  it('documents each of them', () => {
    const example = readFileSync(ENV_EXAMPLE, 'utf8')
    const undocumented = schemaKeys().filter((key) => !example.includes(key))

    expect(
      undocumented,
      `these are validated at boot by src/lib/env.ts but appear nowhere in .env.example: ${undocumented.join(', ')}`,
    ).toEqual([])
  })
})
