import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `viewport-fit=cover` AND `env(safe-area-inset-*)` ARE ONE DECISION.
 *
 * STEP 09 asks for safe-area handling, and this project has none. Checked
 * 2026-09-08: that is correct, not missing. Without `viewport-fit=cover` a
 * browser uses `contain` and letterboxes the viewport, so `position: fixed;
 * inset: 0` already stops short of the notch and the home indicator. Adding
 * insets on their own would pad content away from an edge it never reaches.
 *
 * The failure mode is the pair coming apart, and it comes apart in the
 * plausible direction: `viewportFit: 'cover'` is the ordinary thing to add when
 * a PWA should render edge to edge, and it is a one-line change in a file that
 * has nothing to do with the two components it breaks.
 *
 * What it breaks, both measured as present today:
 *   the consent banner    `fixed bottom-0`, buttons at the bottom edge.
 *                         globals.css records a Pixel 5 run where this element
 *                         already made a control unclickable by overlaying it.
 *   `.checkout-frame`     `inset: 0` with 24px padding, against a notch of
 *                         roughly 47px, holding the payment iframe.
 */
const ROOT = resolve(__dirname, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(tsx?|css)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const SOURCES = walk(join(ROOT, 'src')).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

/** Comments stripped: a paragraph explaining the pair is not the pair. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n')
}

const declaresCover = SOURCES.filter((f) =>
  /viewportFit:\s*['"]cover['"]|viewport-fit=cover/.test(code(f.text)),
)
const declaresInsets = SOURCES.filter((f) => /safe-area-inset-/.test(code(f.text)))

describe('the pair holds', () => {
  it('does not ship cover without insets', () => {
    expect(
      declaresCover.length === 0 || declaresInsets.length > 0,
      'viewport-fit=cover is set and nothing uses env(safe-area-inset-*). The consent banner sits at bottom-0 and .checkout-frame is inset:0 with 24px padding, so both now render into the unsafe area.',
    ).toBe(true)
  })

  it('does not ship insets without cover', () => {
    // The inert direction: env(safe-area-inset-*) resolves to 0 under
    // `contain`, so the padding is dead code that reads as protection.
    expect(
      declaresInsets.length === 0 || declaresCover.length > 0,
      'env(safe-area-inset-*) is used without viewport-fit=cover, where it always resolves to 0.',
    ).toBe(true)
  })
})

describe('the elements the pair protects are still the ones named', () => {
  const globals = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
  const checkout = readFileSync(join(ROOT, 'src/styles/checkout-page.css'), 'utf8')

  it('the consent banner is still bottom-fixed', () => {
    expect(globals).toContain('fixed bottom-0')
  })

  it('the checkout frame is still a full-bleed overlay', () => {
    const frame = checkout.slice(checkout.indexOf('.checkout-frame {'))
    expect(frame.slice(0, 200)).toContain('position: fixed')
    expect(frame.slice(0, 200)).toContain('inset: 0')
  })
})
