import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * SPACING SCALE ENFORCEMENT (UX34)
 *
 * FAIL if any component uses spacing outside the scale: 4 8 12 16 24 32 48 64px.
 *
 * Valid keys for scale (Tailwind default 4px/unit):
 *   4px  = p-1, m-1, gap-1
 *   8px  = p-2, m-2, gap-2
 *   12px = p-3, m-3, gap-3
 *   16px = p-4, m-4, gap-4
 *   24px = p-6, m-6, gap-6
 *   32px = p-8, m-8, gap-8
 *   48px = p-12, m-12, gap-12
 *   64px = p-16, m-16, gap-16
 */

// Utilities that map to the scale
const ON_SCALE = new Set([
  'p-1',
  'p-2',
  'p-3',
  'p-4',
  'p-6',
  'p-8',
  'p-12',
  'p-16',
  'px-1',
  'px-2',
  'px-3',
  'px-4',
  'px-6',
  'px-8',
  'px-12',
  'px-16',
  'py-1',
  'py-2',
  'py-3',
  'py-4',
  'py-6',
  'py-8',
  'py-12',
  'py-16',
  'ps-1',
  'ps-2',
  'ps-3',
  'ps-4',
  'ps-6',
  'ps-8',
  'ps-12',
  'ps-16',
  'pe-1',
  'pe-2',
  'pe-3',
  'pe-4',
  'pe-6',
  'pe-8',
  'pe-12',
  'pe-16',
  'm-1',
  'm-2',
  'm-3',
  'm-4',
  'm-6',
  'm-8',
  'm-12',
  'm-16',
  'mx-1',
  'mx-2',
  'mx-3',
  'mx-4',
  'mx-6',
  'mx-8',
  'mx-12',
  'mx-16',
  'my-1',
  'my-2',
  'my-3',
  'my-4',
  'my-6',
  'my-8',
  'my-12',
  'my-16',
  'ms-1',
  'ms-2',
  'ms-3',
  'ms-4',
  'ms-6',
  'ms-8',
  'ms-12',
  'ms-16',
  'me-1',
  'me-2',
  'me-3',
  'me-4',
  'me-6',
  'me-8',
  'me-12',
  'me-16',
  'gap-1',
  'gap-2',
  'gap-3',
  'gap-4',
  'gap-6',
  'gap-8',
  'gap-12',
  'gap-16',
  'space-x-1',
  'space-x-2',
  'space-x-3',
  'space-x-4',
  'space-x-6',
  'space-x-8',
  'space-x-12',
  'space-x-16',
  'space-y-1',
  'space-y-2',
  'space-y-3',
  'space-y-4',
  'space-y-6',
  'space-y-8',
  'space-y-12',
  'space-y-16',
])

// Allowed non-scale values
const ALLOWED_EXEMPTIONS = new Set([
  'p-0',
  'px-0',
  'py-0',
  'ps-0',
  'pe-0',
  'm-0',
  'mx-0',
  'my-0',
  'ms-0',
  'me-0',
  'gap-0',
  'space-x-0',
  'space-y-0',
  'p-auto',
  'm-auto',
  'mx-auto',
  'my-auto',
  'h-0',
  'h-auto',
  'h-screen',
  'h-full',
  'h-min',
  'h-max',
  'h-fit',
  'w-0',
  'w-auto',
  'w-screen',
  'w-full',
  'w-min',
  'w-max',
  'w-fit',
  'min-h-0',
  'min-w-0',
  'inset-0',
  'inset-auto',
  'inset-x-0',
  'inset-y-0',
  'top-0',
  'top-auto',
  'top-full',
  'right-0',
  'right-auto',
  'right-full',
  'bottom-0',
  'bottom-auto',
  'bottom-full',
  'left-0',
  'left-auto',
  'left-full',
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
          if (!cls) continue

          // Check if this looks like a spacing utility
          const isSpacingUtility =
            /^(p|px|py|ps|pe|m|mx|my|ms|me|gap|space-[xy]|h|w|min-[hw]|inset|top|right|bottom|left)[a-z-]*-\d+/.test(
              cls,
            )

          if (isSpacingUtility) {
            if (!ON_SCALE.has(cls) && !ALLOWED_EXEMPTIONS.has(cls)) {
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
        'Summary by utility:',
        ...Object.entries(summary)
          .sort((a, b) => b[1] - a[1])
          .map(([util, count]) => `  ${util}: ${count} instance(s)`),
        '',
        'Valid scale: 4 8 12 16 24 32 48 64px',
        'Maps to: p-1 p-2 p-3 p-4 p-6 p-8 p-12 p-16 (and variants)',
        '',
        'Violation details (first 10):',
        ...violations.slice(0, 10).map((v) => `  ${v.file}: ${v.utility}`),
      ].join('\n')

      expect.fail(message)
    }

    expect(violations.length).toBe(0)
  })
})
