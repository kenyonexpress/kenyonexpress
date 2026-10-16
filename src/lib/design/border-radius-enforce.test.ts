import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * BORDER-RADIUS SCALE ENFORCEMENT (UX35)
 *
 * FAIL if any component uses border-radius outside the consistent scale: 4 8 12 16 24px.
 *
 * Semantic assignments:
 *   4px  = xs (minimal rounding)
 *   8px  = sm (buttons, form inputs)
 *   12px = md (cards, elevated surfaces)
 *   16px = lg (modals, large dialogs)
 *   24px = xl (extra large, special components)
 *
 * Additional tokens kept from live:
 *   22px = pill (search bar, badges, tags)
 *   200px = round (avatars, circular icons)
 *   0px = none (explicit no rounding)
 *
 * Tailwind classes:
 *   rounded-xs = rounded-xs
 *   rounded-sm = rounded-sm (buttons)
 *   rounded-md = rounded-md (cards)
 *   rounded-lg = rounded-lg (modals)
 *   rounded-xl = rounded-xl (large)
 *   rounded-pill = rounded-pill
 *   rounded-round = rounded-round
 *   rounded-none = rounded-none
 */

// Valid border-radius scale keys
const VALID_RADIUS_KEYS = new Set([
  '', // bare 'rounded' is Tailwind default (0.25rem)
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'pill',
  'round',
  'full', // alias for rounded (circular/50%)
  'none',
])

// Custom CSS variable radius tokens (defined in src/styles/tokens.css)
const CUSTOM_RADIUS_TOKENS = new Set([
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  'pill',
  'round',
  'full',
  'none',
  'btn',
  'card',
  'elevated',
])

function walkComponents(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        files.push(...walkComponents(path))
      } else if (entry.endsWith('.tsx')) {
        files.push(path)
      }
    }
  } catch {
    // ignore
  }
  return files
}

function isRadiusUtility(cls: string): boolean {
  if (!cls) return false
  // Match: rounded, rounded-*, rounded-t-*, rounded-b-*, rounded-l-*, rounded-r-*, etc.
  return /^rounded(-[a-z]{1,2})?(-.*)?$/.test(cls) && cls !== 'rounded'
}

describe('border-radius scale enforcement (UX35)', () => {
  it('MUST NOT have off-scale border-radius in any component', () => {
    const files = walkComponents('src/components')

    const violations: Array<{ file: string; utility: string }> = []

    for (const file of files) {
      const content = readFileSync(file, 'utf8')

      // Find all className declarations
      const classNameMatches = content.matchAll(/className\s*=\s*["'`]([^"'`]+)["'`]/g)

      for (const match of classNameMatches) {
        const classString = match[1]
        const classes = classString.split(/\s+/)

        for (const cls of classes) {
          if (!cls || !isRadiusUtility(cls)) continue

          // Allow arbitrary values (e.g., rounded-[8px], rounded-[50%]) - these are intentional
          if (cls.includes('[')) continue

          // Extract the key: rounded-sm, rounded-md, rounded-pill, rounded-t-lg, etc.
          let key = ''

          // Check if it's side-specific: rounded-t-lg, rounded-bl-md, etc.
          const sideMatch = cls.match(/^rounded-([a-z]{1,2})-(.+)$/)
          if (sideMatch) {
            // Side-specific variant: extract the radius value (e.g., 'lg' from 'rounded-t-lg')
            key = sideMatch[2]
          } else {
            // Regular variant: rounded-sm, rounded-md, etc.
            key = cls.replace('rounded-', '')
          }

          // Allow: valid scale keys or custom CSS variable tokens
          if (key && !VALID_RADIUS_KEYS.has(key) && !CUSTOM_RADIUS_TOKENS.has(key)) {
            violations.push({ file, utility: cls })
          }
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations.reduce(
        (acc, v) => {
          acc[v.utility] = (acc[v.utility] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      const message = [
        `❌ BORDER-RADIUS SCALE VIOLATION: ${violations.length} off-scale utilities found`,
        '',
        'Summary by utility (top 20):',
        ...Object.entries(summary)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([util, count]) => `  ${util}: ${count} instance(s)`),
        '',
        'Valid scale keys: xs sm md lg xl pill round none',
        'Pixel values: 4 8 12 16 24 22 200 0',
        '',
        'Use only: rounded-xs rounded-sm rounded-md rounded-lg rounded-xl',
        '    rounded-pill rounded-round rounded-none',
        '',
        'Component guidance:',
        '  - Buttons: rounded-sm (8px)',
        '  - Cards: rounded-md (12px)',
        '  - Modals: rounded-lg (16px)',
        '  - Avatar/icons: rounded-round (200px)',
      ].join('\n')

      expect.fail(message)
    }

    expect(violations.length).toBe(0)
  })
})
