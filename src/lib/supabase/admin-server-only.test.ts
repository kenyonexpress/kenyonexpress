import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The service-role client stays out of everything the browser can reach.
 *
 * `createAdminClient()` bypasses RLS wholesale, so the entire RBAC/RLS model
 * (roles in `profiles.role`, deny-all defaults, section gates) holds only as
 * long as the service-role key lives strictly in server code: server actions,
 * route handlers, server components and `src/lib`/`src/server` modules. The
 * one thing that must never happen is the admin module or the raw key names
 * appearing in a client component -- Next would then try to inline the import
 * into the browser bundle, and a single `'use client'` line added to the wrong
 * file is all it takes. That is a one-line mistake nothing else in CI catches,
 * which is exactly the shape of failure a source scan is for (same reasoning
 * as route-guards.test.ts).
 *
 * WHY A SCAN AND NOT `import 'server-only'`. The package would fail the build
 * on a client import of admin.ts itself, but it cannot see the second hazard:
 * a client file reading `process.env.SUPABASE_SERVICE_ROLE_KEY` directly --
 * that compiles fine, silently inlines `undefined`, and starts "working" the
 * moment someone adds the var to the client env. The scan closes both doors
 * and needs no new dependency.
 */

const SRC = 'src'

/** Direct readers of the raw service-role env names. Everyone else goes
 * through `createAdminClient()`. Each entry states why it may read the raw
 * name, and the reason substring is checked so a rewritten file falls off the
 * list instead of inheriting the exemption. */
const RAW_ENV_READERS: Record<string, { because: string; mustContain: string }> = {
  'src/lib/env.ts': {
    because: 'the env schema itself declares and validates the key',
    mustContain: 'SUPABASE_SERVICE_ROLE_KEY',
  },
  'src/lib/supabase/admin.ts': {
    because: 'the single service-role client factory',
    mustContain: 'export function createAdminClient',
  },
  'src/lib/supabase/admin-key.ts': {
    because: 'names the vars in operator-facing misconfiguration messages',
    mustContain: 'checkAdminKey',
  },
  'src/instrumentation.ts': {
    because: 'boot wiring, names the key while explaining the liveness probe it starts',
    mustContain: 'reportEnvironment',
  },
  'src/lib/env-probe.ts': {
    because: 'boot-time liveness check must read the raw key to test it against the project',
    mustContain: 'probeEnvironment',
  },
  'src/lib/auth/passkeys/config.ts': {
    because: 'passkey store reads the key pair directly (178 lifecycle)',
    mustContain: 'SUPABASE_SERVICE_ROLE_KEY',
  },
}

const ENV_NAMES = /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/
const ADMIN_IMPORT =
  /from\s+['"](?:@\/lib\/supabase\/admin|\.{1,2}\/(?:\.\.\/)*supabase\/admin|\.\/admin)['"]/
const USE_CLIENT = /^\s*['"]use client['"]/m

function walk(dir: string): string[] {
  let found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(walk(full))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full)
  }
  return found
}

const files = walk(resolve(process.cwd(), SRC)).map((abs) => ({
  rel: relative(process.cwd(), abs),
  text: readFileSync(abs, 'utf8'),
}))

const isTest = (rel: string) => /\.test\.tsx?$/.test(rel) || rel.includes('__tests__')

describe('service-role client is server-only', () => {
  it('no client component imports the admin client or names the key', () => {
    const offenders = files
      .filter(({ text }) => USE_CLIENT.test(text))
      .filter(({ text }) => ADMIN_IMPORT.test(text) || ENV_NAMES.test(text))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('src/components never touches the admin client', () => {
    const offenders = files
      .filter(({ rel }) => rel.startsWith('src/components/'))
      .filter(({ text }) => ADMIN_IMPORT.test(text) || ENV_NAMES.test(text))
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })

  it('raw service-role env reads happen only in the allowlisted files', () => {
    const readers = files
      .filter(({ rel }) => !isTest(rel))
      .filter(({ text }) => ENV_NAMES.test(text))
      .map(({ rel }) => rel)
      .sort()
    expect(readers).toEqual(Object.keys(RAW_ENV_READERS).sort())
  })

  it('every allowlist entry still is what its reason says it is', () => {
    for (const [rel, { mustContain }] of Object.entries(RAW_ENV_READERS)) {
      const file = files.find((f) => f.rel === rel)
      expect(file, `${rel} left the tree; drop its allowlist entry`).toBeDefined()
      expect(file?.text ?? '').toContain(mustContain)
    }
  })
})
