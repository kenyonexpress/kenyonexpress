import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A SPACING TOKEN MUST NOT BE NAMED AFTER A TAILWIND CONTAINER SIZE.
 *
 * This is not a style preference. In Tailwind v4 the `max-w-*` utility resolves
 * from the SPACING namespace when a spacing key of that name exists, ahead of
 * the container scale. So declaring
 *
 *     --spacing-sm: 8px;
 *
 * does not merely add a `p-sm` utility. It redefines `max-w-sm` from 24rem to
 * 8px, everywhere, silently. The generated stylesheet said it outright:
 * `.max-w-sm{max-width:var(--spacing-sm)}`.
 *
 * MEASURED, 2026-09-06, before the tokens were removed. Six of them were
 * declared -- xs, sm, md, lg, xl, 2xl -- and 31 call sites across the app were
 * laying out at between 4px and 24px of max-width. On a built server at 320px
 * the auth card computed `max-width: 8px`, so /login, /signup,
 * /forgot-password, /reset-password and /suppliers rendered an 8px column with
 * the unbreakable 208px word "KenyonExpress" spilling 44px past the start edge:
 * `document.scrollWidth` 364 in a 320 viewport. /redeem/[token], /coupon/[id],
 * error.tsx, not-found.tsx, dialog.tsx, the command palette and the install
 * banner were all on the same list.
 *
 * Adding `--container-sm` alongside does not fix it. That was tried against the
 * Tailwind CLI and the emitted rule still read `var(--spacing-sm)`. Spacing wins
 * the name, so the only fix is for the name not to be taken -- which is what
 * this test enforces.
 *
 * A named spacing step is still perfectly fine. Give it a name Tailwind does
 * not already own: `--spacing-gutter` is the pattern, and it is untouched.
 */

/**
 * Tailwind's container scale. A `--spacing-*` token sharing any of these names
 * captures the matching `max-w-*`, `min-w-*` and `w-*` utility.
 */
const CONTAINER_SIZES = [
  '3xs',
  '2xs',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
]

function tokensCss(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
}

/** Every `--spacing-<name>` actually declared, comments stripped. */
function declaredSpacingNames(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...code.matchAll(/--spacing-([a-z0-9-]+)\s*:/g)].map((m) => m[1] as string)
}

describe('spacing tokens and Tailwind container sizes', () => {
  it('reads a real file with real tokens in it, not an empty match', () => {
    // Without this the whole file passes vacuously the day the path moves.
    const css = tokensCss()
    expect(css.length).toBeGreaterThan(1000)
    expect(declaredSpacingNames(css)).toContain('gutter')
  })

  it('declares no spacing token named after a container size', () => {
    const collisions = declaredSpacingNames(tokensCss()).filter((name) =>
      CONTAINER_SIZES.includes(name),
    )

    // ONE template literal, not several joined with `+`. This repo has already
    // lost text that way in a production build, and biome enforces it.
    const detail = `--spacing-${collisions.join(', --spacing-')} silently redefines max-w-${collisions.join(', max-w-')}. Tailwind resolves max-w-* from the spacing namespace ahead of the container scale, so this is not an addition, it is an override: max-w-sm stops meaning 24rem. Rename the token to something Tailwind does not own, as --spacing-gutter does.`

    expect(collisions, collisions.length === 0 ? '' : detail).toEqual([])
  })

  it('still declares the named step that does not collide', () => {
    // The rule is "do not take Tailwind's names", not "do not name a step".
    // If this ever goes red the fix above was applied by deleting too much.
    expect(tokensCss()).toContain('--spacing-gutter:')
  })
})
