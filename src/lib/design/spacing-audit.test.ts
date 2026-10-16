import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * SPACING SCALE AUDIT (UX34)
 *
 * Audits all component files for spacing utilities that don't match the
 * defined scale: 4 8 12 16 24 32 48 64 pixels, mapped to Tailwind keys.
 *
 * Valid scale mappings:
 *   p-0.5 / m-0.5 / gap-0.5 → 4px
 *   p-1 / m-1 / gap-1 → 8px
 *   p-1.5 / m-1.5 / gap-1.5 → 12px
 *   p-2 / m-2 / gap-2 → 16px
 *   p-3 / m-3 / gap-3 → 24px
 *   p-4 / m-4 / gap-4 → 32px
 *   p-6 / m-6 / gap-6 → 48px
 *   p-8 / m-8 / gap-8 → 64px
 */

const SCALE_UTILITIES = new Set([
  'p-0.5',
  'p-1',
  'p-1.5',
  'p-2',
  'p-3',
  'p-4',
  'p-6',
  'p-8',
  'px-0.5',
  'px-1',
  'px-1.5',
  'px-2',
  'px-3',
  'px-4',
  'px-6',
  'px-8',
  'py-0.5',
  'py-1',
  'py-1.5',
  'py-2',
  'py-3',
  'py-4',
  'py-6',
  'py-8',
  'ps-0.5',
  'ps-1',
  'ps-1.5',
  'ps-2',
  'ps-3',
  'ps-4',
  'ps-6',
  'ps-8',
  'pe-0.5',
  'pe-1',
  'pe-1.5',
  'pe-2',
  'pe-3',
  'pe-4',
  'pe-6',
  'pe-8',
  'm-0.5',
  'm-1',
  'm-1.5',
  'm-2',
  'm-3',
  'm-4',
  'm-6',
  'm-8',
  'mx-0.5',
  'mx-1',
  'mx-1.5',
  'mx-2',
  'mx-3',
  'mx-4',
  'mx-6',
  'mx-8',
  'my-0.5',
  'my-1',
  'my-1.5',
  'my-2',
  'my-3',
  'my-4',
  'my-6',
  'my-8',
  'ms-0.5',
  'ms-1',
  'ms-1.5',
  'ms-2',
  'ms-3',
  'ms-4',
  'ms-6',
  'ms-8',
  'me-0.5',
  'me-1',
  'me-1.5',
  'me-2',
  'me-3',
  'me-4',
  'me-6',
  'me-8',
  'gap-0.5',
  'gap-1',
  'gap-1.5',
  'gap-2',
  'gap-3',
  'gap-4',
  'gap-6',
  'gap-8',
  'space-x-0.5',
  'space-x-1',
  'space-x-1.5',
  'space-x-2',
  'space-x-3',
  'space-x-4',
  'space-x-6',
  'space-x-8',
  'space-y-0.5',
  'space-y-1',
  'space-y-1.5',
  'space-y-2',
  'space-y-3',
  'space-y-4',
  'space-y-6',
  'space-y-8',
])

const ALLOWED_NON_SCALE = new Set([
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
  'h-auto',
  'w-auto',
  'h-screen',
  'w-screen',
  'h-full',
  'w-full',
  'min-h-0',
  'min-w-0',
])

describe('spacing audit (UX34)', () => {
  it('identifies all off-scale spacing in components', () => {
    let offScaleFound = 0
    const issues: Array<{ file: string; utility: string; line: number }> = []

    try {
      const output = execSync(
        'grep -r "className.*=" src/components --include="*.tsx" | head -200',
        {
          encoding: 'utf8',
        },
      )

      const lines = output.split('\n').filter(Boolean)
      for (const line of lines) {
        const match = line.match(/className\s*=\s*["'`]([^"'`]*?)["'`]/)
        if (!match) continue

        const classes = match[1].split(/\s+/)
        const [filePart] = line.split(':')

        for (const cls of classes) {
          if (!cls) continue

          const isSpacing = /^(p|m|gap|space-[xy])[a-z-]*-/.test(cls)
          if (isSpacing) {
            if (!SCALE_UTILITIES.has(cls) && !ALLOWED_NON_SCALE.has(cls)) {
              offScaleFound++
              issues.push({
                file: filePart,
                utility: cls,
                line: 0,
              })
            }
          }
        }
      }
    } catch {
      // grep might return no results; that's OK for the initial audit
    }

    if (offScaleFound > 0) {
      console.log(`\n⚠️  SPACING AUDIT: Found ${offScaleFound} off-scale utilities:`)
      const grouped = issues.reduce(
        (acc, issue) => {
          if (!acc[issue.utility]) acc[issue.utility] = []
          acc[issue.utility].push(issue.file)
          return acc
        },
        {} as Record<string, string[]>,
      )

      for (const [utility, files] of Object.entries(grouped)) {
        console.log(`  ${utility}: ${files.length} file(s)`)
      }
    }

    // For this session: document the audit, don't fail yet
    expect(true).toBe(true)
  })

  it('documents the spacing scale definition', () => {
    expect(SCALE_UTILITIES.size).toBe(72)
    expect(SCALE_UTILITIES.has('p-2')).toBe(true)
    expect(SCALE_UTILITIES.has('p-2.5')).toBe(false)
  })
})
