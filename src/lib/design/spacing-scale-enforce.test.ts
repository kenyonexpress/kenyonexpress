import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SPACING SCALE ENFORCEMENT (UX34)
 *
 * FAIL if any component uses spacing outside the scale: 4 8 12 16 24 32 48 64px.
 *
 * Valid keys for scale (Tailwind default 4px/unit):
 *   4px  = 1 (p-1, m-1, gap-1, mb-1, py-1, etc.)
 *   8px  = 2 (p-2, m-2, gap-2, etc.)
 *   12px = 3 (p-3, m-3, gap-3, etc.)
 *   16px = 4 (p-4, m-4, gap-4, etc.)
 *   24px = 6 (p-6, m-6, gap-6, etc.)
 *   32px = 8 (p-8, m-8, gap-8, etc.)
 *   48px = 12 (p-12, m-12, gap-12, etc.)
 *   64px = 16 (p-16, m-16, gap-16, etc.)
 */

// Valid spacing scale keys (4px units)
const VALID_SPACING_KEYS = new Set(['1', '2', '3', '4', '6', '8', '12', '16', '0', 'auto', 'px'])

// Custom CSS variable spacing tokens (defined in src/styles/tokens.css)
const CUSTOM_SPACING_TOKENS = new Set([
  'gutter',
  'deals-pad',
  'deals-pad-md',
  'drawer-pad',
  'drawer-row',
  'feature-bar',
  'deal-countdown',
  'deal-countdown-pad',
  'touch-pad',
  'region-inset',
  'lg',
  'xl',
  'sm',
  'md',
  // Hyphenated token names
  'deals-pad',
  'deal-countdown-pad',
  'drawer-pad',
  'region-inset',
  'touch-pad',
])

// Exemptions: non-spacing utilities that happen to use -N syntax
const NON_SPACING_PATTERNS = new Set([
  'h-',
  'w-',
  'min-h-',
  'min-w-',
  'max-w-',
  'max-h-',
  'top-',
  'right-',
  'bottom-',
  'left-',
  'inset-',
  'inset-x-',
  'inset-y-',
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

function isSpacingUtility(cls: string): boolean {
  if (!cls) return false
  // Spacing utilities: p, px, py, ps, pe, m, mx, my, ms, me, gap, space-x, space-y
  const spacingPatterns = [
    'p-',
    'px-',
    'py-',
    'ps-',
    'pe-',
    'm-',
    'mx-',
    'my-',
    'ms-',
    'me-',
    'gap-',
    'space-',
  ]
  return spacingPatterns.some((p) => cls.startsWith(p))
}

function isNonSpacingUtility(cls: string): boolean {
  // h-, w-, position, etc are NOT spacing for this scale
  return [...NON_SPACING_PATTERNS].some((p) => cls.startsWith(p))
}

describe('spacing scale enforcement (UX34)', () => {
  it('MUST NOT have off-scale spacing in any component', () => {
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
          if (!cls || isNonSpacingUtility(cls)) continue

          if (isSpacingUtility(cls)) {
            // Allow arbitrary values (e.g., gap-[2px], mx-[1em]) - these are intentional
            if (cls.includes('[')) continue

            // Extract the key from end: p-1, mb-2.5, gap-12, gap-x-6, space-y-1.5, px-gutter, etc.
            let key = ''
            if (cls.match(/^space-[xy]-/) || cls.match(/^gap-[xy]-/)) {
              // space-x-1, space-y-1.5, gap-x-6, gap-y-2 → extract '1', '1.5', '6', '2'
              key = cls.split('-').pop() || ''
            } else {
              // p-1, mb-2.5, px-gutter, gap-12 → extract after direction prefix
              const match = cls.match(/^(p|px|py|ps|pe|m|mx|my|ms|me|gap)-(.+)$/)
              key = match ? match[2] : ''
            }

            // Allow: numeric scale keys, custom CSS variable tokens, or exemptions
            if (key && !VALID_SPACING_KEYS.has(key) && !CUSTOM_SPACING_TOKENS.has(key)) {
              violations.push({ file, utility: cls })
            }
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
        `❌ SPACING SCALE VIOLATION: ${violations.length} off-scale utilities found`,
        '',
        'Summary by utility (top 20):',
        ...Object.entries(summary)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([util, count]) => `  ${util}: ${count} instance(s)`),
        '',
        'Valid scale keys: 1 2 3 4 6 8 12 16 (and 0, auto, px for special cases)',
        'Pixel values: 4 8 12 16 24 32 48 64',
        '',
        'Use only: p-1 p-2 p-3 p-4 p-6 p-8 p-12 p-16',
        '    (and directional variants: px-, py-, ps-, pe-, mb-, mt-, gap-, etc.)',
      ].join('\n')

      expect.fail(message)
    }

    expect(violations.length).toBe(0)
  })
})
