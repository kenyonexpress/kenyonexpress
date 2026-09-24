import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The deploy pipeline, asserted as text, the way sentry-sourcemaps.test.ts
 * asserts the source-map contract: every piece below fails silently when it
 * is wrong. A workflow that forgets `concurrency` lets two promotions race;
 * a rollback step that reads `secrets` from its `if` is skipped forever with
 * no error; a mark-release step that runs on a rolled-back deploy stamps a
 * release that never served. None of those fail lint, type-check or a unit
 * test of the scripts, so the wiring is pinned here.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('blue-green promotion workflow', () => {
  const wf = read('.github/workflows/deploy-promote.yml')

  it('serialises production changes with the same concurrency group as auto-rollback', () => {
    expect(wf).toMatch(
      /concurrency:\s*\n\s*group: deploy-production\s*\n\s*cancel-in-progress: false/,
    )
    expect(read('.github/workflows/auto-rollback.yml')).toMatch(/group: deploy-production/)
  })

  it('gates on VERCEL_TOKEN and announces the skip instead of failing red', () => {
    expect(wf).toContain('if [ -z "$VERCEL_TOKEN" ]')
    expect(wf).toContain('::warning title=Blue-green deploy skipped::')
  })

  it('runs the deploy preflight against the pulled production env before building', () => {
    const preflight = wf.indexOf('node scripts/deploy-preflight.mjs')
    const build = wf.indexOf('vercel@latest build')
    expect(preflight).toBeGreaterThan(-1)
    expect(build).toBeGreaterThan(preflight)
    expect(wf).toContain('. .vercel/.env.production.local')
  })

  it('uploads the green WITHOUT --prod so the domain moves only through promote.mjs', () => {
    const deployLine = wf.split('\n').find((l) => l.includes('vercel@latest deploy --prebuilt'))
    expect(deployLine).toBeDefined()
    expect(deployLine).not.toContain('--prod')
    expect(wf).toContain('node scripts/deploy/promote.mjs')
  })

  it('marks the release only on exit 0, and marks a rollback on 4 or 5', () => {
    expect(wf).toMatch(/steps\.promote\.outputs\.code == '0'[^\n]*\n[\s\S]*?--event promoted/)
    expect(wf).toMatch(
      /steps\.promote\.outputs\.code == '4' \|\| steps\.promote\.outputs\.code == '5'/,
    )
    expect(wf).toContain('--event rolled-back')
  })

  it('opens an incident issue on exit 5, the code for "rollback also failed"', () => {
    expect(wf).toMatch(
      /if: [^\n]*steps\.promote\.outputs\.code == '5'\s*\n\s*uses: actions\/github-script/,
    )
  })
})

describe('auto-rollback workflow', () => {
  const wf = read('.github/workflows/auto-rollback.yml')

  it('listens for deployment_status and only acts on a successful production deployment', () => {
    expect(wf).toMatch(/^on:\s*\n\s*deployment_status:/m)
    expect(wf).toContain("github.event.deployment_status.state == 'success'")
    expect(wf).toContain("github.event.deployment.environment == 'Production'")
  })

  it('never reads `secrets` from a step `if`, which GitHub silently evaluates as false', () => {
    const ifLines = wf.split('\n').filter((l) => /^\s*if:/.test(l))
    for (const line of ifLines) expect(line).not.toContain('secrets.')
    expect(wf).toContain("steps.gate.outputs.has_token == 'true'")
  })

  it('pages before rolling back, and rolls back only when the smoke failed', () => {
    const page = wf.indexOf('scripts/deploy/notify.mjs')
    const rollback = wf.indexOf('scripts/deploy/rollback.mjs')
    expect(page).toBeGreaterThan(-1)
    expect(rollback).toBeGreaterThan(page)
    expect(wf).toMatch(/id: rollback\s*\n\s*if: steps\.smoke\.outputs\.smoke_ok == 'false'/)
  })

  it('shares the production-down label with the daily smoke so one outage is one thread', () => {
    expect(wf).toContain("const label = 'production-down'")
    expect(read('.github/workflows/production-smoke.yml')).toContain(
      "const label = 'production-down'",
    )
  })

  it('goes red when production did not pass, after the issue is written', () => {
    const issue = wf.indexOf('Open or update the outage issue')
    const fail = wf.indexOf('Fail the run when production did not pass')
    expect(fail).toBeGreaterThan(issue)
  })
})

describe('daily smoke pages the phone', () => {
  it('calls the deploy notifier on failure, without swallowing the issue step', () => {
    const wf = read('.github/workflows/production-smoke.yml')
    expect(wf).toContain('node scripts/deploy/notify.mjs --priority urgent')
    expect(wf).toMatch(/notify\.mjs[\s\S]*?\|\| true/)
  })
})

describe('the scripts the workflows name exist and are registered', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

  it.each([
    'scripts/deploy/lib.mjs',
    'scripts/deploy/smoke.mjs',
    'scripts/deploy/promote.mjs',
    'scripts/deploy/rollback.mjs',
    'scripts/deploy/notify.mjs',
    'scripts/deploy/mark-release.mjs',
    'scripts/deploy/migrate-plan.mjs',
    'scripts/deploy/vercel.mjs',
  ])('%s exists', (path) => {
    expect(() => read(path)).not.toThrow()
  })

  it('exposes them as package scripts', () => {
    expect(pkg.scripts['deploy:smoke']).toContain('scripts/deploy/smoke.mjs')
    expect(pkg.scripts['deploy:promote']).toContain('scripts/deploy/promote.mjs')
    expect(pkg.scripts['deploy:rollback']).toContain('scripts/deploy/rollback.mjs')
    expect(pkg.scripts['migrate:plan']).toContain('scripts/deploy/migrate-plan.mjs')
  })

  it('runs the deploy tests in vitest', () => {
    expect(read('vitest.config.ts')).toContain("'scripts/deploy/**/*.test.mjs'")
  })

  it('keeps the migration planner offline: no supabase client, no fetch', () => {
    const planner = read('scripts/deploy/migrate-plan.mjs')
    expect(planner).not.toMatch(/from ['"]@supabase/)
    expect(planner).not.toMatch(/\bfetch\(/)
    expect(planner).toContain("tool: 'mcp__claude_ai_Supabase__apply_migration'")
  })
})

describe('the deploy incident text is identifiers only', () => {
  it('names no env var and quotes no response body', () => {
    const lib = read('scripts/deploy/lib.mjs')
    const fn = lib.slice(
      lib.indexOf('export function formatDeployIncident'),
      lib.indexOf('export function incidentPriority'),
    )
    expect(fn).not.toContain('process.env')
    expect(fn).not.toContain('.body')
  })
})
