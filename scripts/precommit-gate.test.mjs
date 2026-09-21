import { describe, expect, it } from 'vitest'
import { planPrecommit } from './precommit-gate.mjs'

describe('planPrecommit', () => {
  it('type-checks staged TypeScript under src, e2e and scripts, and tests only src', () => {
    const plan = planPrecommit([
      'src/lib/money.ts',
      'e2e/helpers.ts',
      'scripts/precommit-gate.test.ts',
      'src/types/database.d.ts',
      'docs/DX.md',
      'package.json',
      'apps/mobile/app.ts',
    ])
    expect(plan.typecheck).toEqual([
      'src/lib/money.ts',
      'e2e/helpers.ts',
      'scripts/precommit-gate.test.ts',
    ])
    expect(plan.related).toEqual(['src/lib/money.ts'])
  })

  it('has nothing to do for a docs-only commit', () => {
    expect(planPrecommit(['docs/DX.md', 'STATE.md'])).toEqual({ typecheck: [], related: [] })
  })
})
