import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE PREFLIGHT EXISTED FOR NINETEEN DAYS WITH NO CALLER.
 *
 * `scripts/deploy-preflight.mjs` was written on 2026-09-06 to refuse a deploy
 * that carries the exposed `SUPABASE_SECRET_KEY`. `docs/DEPLOY.md`,
 * `docs/OWASP-TOP-10.md`, `src/lib/env.ts` and `CLAUDE.md` all described it as
 * "wired into `vercel.json`'s `buildCommand`". Measured on 2026-09-25 (Q24):
 * `vercel.json` ran `pnpm build` and nothing else, so Vercel built with whatever
 * was set and the control that four documents relied on was a script nobody
 * ran. This is the dominant defect shape in this repository, a finished feature
 * with no consumer, and the only fix that lasts is a test that reads the wiring.
 *
 * The behaviour tests spawn the script under a controlled environment (`env -i`
 * style: nothing inherited) so they measure the exit code a deploy would get,
 * not the module's internals.
 */

// vitest runs from the repository root and the jsdom environment rewrites
// `import.meta.url` to a non-file scheme, so paths are resolved from cwd.
const repoRoot = process.cwd()
const script = resolve(repoRoot, 'scripts/deploy-preflight.mjs')

/** Every variable the preflight wants, with harmless placeholder values. */
const COMPLETE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-placeholder',
  SUPABASE_SECRET_KEY: 'not-a-listed-key',
  CARDCOM_TERMINAL_NUMBER: '1000',
  CARDCOM_API_NAME: 'placeholder',
  CARDCOM_API_PASSWORD: 'placeholder',
  CARDCOM_WEBHOOK_SECRET: 'placeholder',
  VOUCHER_QR_SECRET: 'placeholder',
  CRON_SECRET: 'placeholder',
}

/** Runs the preflight with ONLY the given variables and returns what a CI log would show. */
function run(env) {
  try {
    const stdout = execFileSync(process.execPath, [script], {
      cwd: repoRoot,
      env: { PATH: process.env.PATH ?? '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    return {
      code: error.status,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    }
  }
}

describe('vercel.json runs the preflight before the build', () => {
  it('starts the build command with the preflight and joins with && so a refusal stops the build', () => {
    const vercel = JSON.parse(readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8'))
    // `&&` is the whole point: `;` or a newline would print the refusal and
    // build anyway, which is the state this test exists to prevent.
    expect(vercel.buildCommand).toMatch(/^node scripts\/deploy-preflight\.mjs && /)
    expect(vercel.buildCommand).toContain('pnpm build')
  })

  it('leaves `pnpm build` itself alone, so a local build with the exposed key still works', () => {
    // The script's own header says why: a check that blocks ordinary development
    // gets removed. The refusal belongs on the deploy command, not the build.
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
    expect(pkg.scripts.build).toBe('next build')
  })

  it('requires exactly the variables src/lib/env.ts requires in production', () => {
    // Two lists of the same names in two files drift. The boot guard is the
    // source of truth (it is what the running server enforces); the preflight
    // must ask for nothing the guard does not, or a deploy fails for a variable
    // the code never reads.
    const preflight = readFileSync(script, 'utf8')
    const envTs = readFileSync(resolve(repoRoot, 'src/lib/env.ts'), 'utf8')
    const required = preflight.match(/const REQUIRED_RUNTIME = \[([\s\S]*?)\]/)?.[1] ?? ''
    const names = [...required.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)
    const guardBlock = envTs.match(/for \(const k of \[([\s\S]*?)\] as const\)/)?.[1] ?? ''
    const guardNames = [...guardBlock.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1])
    expect(names.sort()).toEqual(guardNames.sort())
  })
})

describe('deploy-preflight exit codes', () => {
  it('exits 0 and prints "clean" when every required variable is present', () => {
    const result = run(COMPLETE)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('deploy preflight: clean')
  })

  it('exits 1 on an empty environment and names every missing variable', () => {
    const result = run({})
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('refusing to ship')
    for (const name of Object.keys(COMPLETE)) {
      if (name === 'SUPABASE_SECRET_KEY') continue
      expect(result.stderr).toContain(name)
    }
    // The admin key line is a pair, either name satisfies it.
    expect(result.stderr).toContain('SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY')
  })

  it('accepts SUPABASE_SERVICE_ROLE_KEY in place of SUPABASE_SECRET_KEY', () => {
    const { SUPABASE_SECRET_KEY: _dropped, ...rest } = COMPLETE
    const result = run({ ...rest, SUPABASE_SERVICE_ROLE_KEY: 'not-a-listed-key' })
    expect(result.code).toBe(0)
  })

  it('refuses CARDCOM_SANDBOX=true, the setting that charges nobody', () => {
    const result = run({ ...COMPLETE, CARDCOM_SANDBOX: 'true' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('SANDBOX')
  })

  it('refuses the local waiver ALLOW_INCOMPLETE_ENV=true on a deploy', () => {
    const result = run({ ...COMPLETE, ALLOW_INCOMPLETE_ENV: 'true' })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('WAIVER')
  })

  it('reports the refusal without echoing any variable value', () => {
    const result = run({ ...COMPLETE, CARDCOM_SANDBOX: 'true' })
    for (const value of Object.values(COMPLETE)) {
      expect(result.stderr).not.toContain(value)
    }
  })
})
