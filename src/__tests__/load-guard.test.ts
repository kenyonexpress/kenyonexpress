import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE GUARD NAMED TWO HOSTS AND PRODUCTION RUNS ON THREE.
 *
 * `load/lib/guard.js` refuses to point the k6 suite at production, hardcoded,
 * with no override flag - the reasoning is right and the list was short. It
 * named `kenyonexpress.co.il` and `www.kenyonexpress.co.il`. Established
 * 2026-09-08: `kenyonexpress.vercel.app` serves the SAME deployment,
 * `/api/health` answers 200 on all three, and the cron scheduler drives real
 * production traffic through the vercel.app one because CRON_BASE_URL is empty
 * and run-cron-jobs.sh falls back to it.
 *
 * So the host production actually runs on was the one this gate did not name,
 * and pointing 500 virtual users at it would have passed both the workflow
 * pre-check and the runtime assert.
 *
 * IT LIVES IN src/__tests__ RATHER THAN BESIDE THE FILE IT TESTS. vitest's
 * `include` covers src, scripts/*.test.mjs and scripts/wp-import; it does not
 * cover load/. The first version of this file sat in load/lib/ and vitest
 * reported "No test files found" - a guard test that nothing runs, which is the
 * shape this repo keeps finding and should not be adding.
 */
const ROOT = resolve(__dirname, '..', '..')
const guard = readFileSync(join(ROOT, 'load/lib/guard.js'), 'utf8')
const workflow = readFileSync(join(ROOT, '.github/workflows/load.yml'), 'utf8')

describe('every host that serves production is refused', () => {
  for (const host of [
    'kenyonexpress.co.il',
    'www.kenyonexpress.co.il',
    'kenyonexpress.vercel.app',
  ]) {
    it(`guard.js names ${host}`, () => {
      const list = guard.slice(guard.indexOf('const PRODUCTION_HOSTS'))
      expect(list.slice(0, 300)).toContain(host)
    })
  }

  it('the workflow pre-check refuses the vercel alias too', () => {
    // Two gates, and a gap in either is the whole gap: the workflow one fails
    // before k6 installs, the runtime one before a request leaves the machine.
    expect(workflow).toContain('kenyonexpress.vercel.app')
  })
})

describe('preview deployments stay usable', () => {
  it('does not blanket-block vercel.app', () => {
    // Previews live on that apex and are what this suite is FOR. A gate people
    // have to work around is worse than a gate with a gap.
    const list = guard.slice(
      guard.indexOf('const PRODUCTION_HOSTS'),
      guard.indexOf('function hostOf'),
    )
    expect(list).not.toMatch(/['"]\.vercel\.app['"]/)
    expect(list).not.toContain('endsWith')
  })
})

describe('the gate keeps having no override', () => {
  it('reads the host list from source, never from the environment', () => {
    const list = guard.slice(
      guard.indexOf('const PRODUCTION_HOSTS'),
      guard.indexOf('function hostOf'),
    )
    expect(list).not.toContain('__ENV')
    expect(list).not.toContain('process.env')
  })
})
