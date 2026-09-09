import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OFF_PAGE } from '@/styles/tokens'
import { describe, expect, it } from 'vitest'

/**
 * The transactional emails must be the same yellow as the site they link to.
 *
 * WHY THIS NEEDED A TEST. Both email builders carried `#f5c518` while every
 * stylesheet in `src` used `#fed700`. Nothing failed. Nothing looked broken in
 * isolation. The email simply arrived in a slightly different yellow from the
 * page its button leads to, which only a customer holding the two side by side
 * would ever notice, and it survived in exactly two hardcoded constants for as
 * long as nobody compared them.
 *
 * WHY THE VALUE CANNOT JUST BE IMPORTED. The builders emit a string of INLINE
 * styles, because mail clients do not honour stylesheets or CSS custom
 * properties. So the hex has to be a literal in the TypeScript, and the only
 * thing that can keep it honest is a test that reads both sides.
 */

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

/**
 * `--color-brand-primary: #fed700;` out of the stylesheet the site renders from.
 *
 * The `@theme` block moved from `src/app/globals.css` to
 * `src/styles/tokens.css` on 2026-09-03. Both are read, newest location first,
 * so this keeps working wherever the declaration lives.
 */
function siteBrandColour(): string {
  const css = [read('src/styles/tokens.css'), read('src/app/globals.css')].join('\n')
  const match = css.match(/--color-brand-primary:\s*(#[0-9a-fA-F]{6})/)
  if (!match?.[1]) {
    throw new Error('neither tokens.css nor globals.css declares --color-brand-primary')
  }
  return match[1].toLowerCase()
}

const EMAIL_BUILDERS = ['src/lib/email/notifications.ts', 'src/lib/email/voucher-email.ts']

describe('the emails carry the site brand', () => {
  const brand = siteBrandColour()

  it('reads a real colour out of globals.css', () => {
    expect(brand).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('OFF_PAGE.brand is the colour the stylesheet declares', () => {
    // The builders no longer own the value at all: they destructure it out of
    // OFF_PAGE. This is the assertion that used to read a `const BRAND` literal
    // out of each of them, moved one hop up to the single place it now lives.
    expect(OFF_PAGE.brand.toLowerCase()).toBe(brand)
  })

  it.each(EMAIL_BUILDERS)('%s takes its colours from OFF_PAGE, not a literal', (file) => {
    // WHAT THIS CATCHES. Re-introducing `const BRAND = '#...'` in a builder --
    // which is exactly the shape the drift took the first time -- puts the
    // value back somewhere a rebrand will miss. The rule is now structural:
    // the module imports the palette, and it names no hex outside its prose.
    const source = read(file)
    expect(source, `${file} must import OFF_PAGE`).toContain(
      "import { OFF_PAGE } from '@/styles/tokens'",
    )
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const literals = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(literals, `${file} carries a raw hex outside its comments`).toEqual([])
  })

  it.each(EMAIL_BUILDERS)('%s hardcodes no OTHER brand-like yellow', (file) => {
    // A second hex sneaking into one template is the same defect one layer
    // down, and BRAND being right would hide it.
    //
    // Comments are stripped first, the same way route-guards.test.ts does it.
    // The doc comment on BRAND names the wrong yellow it replaced, which is
    // worth keeping in prose and is not a colour anything renders.
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
    const yellows = source.match(/#f[0-9a-fA-F]{5}/gi) ?? []
    expect(
      yellows.filter(
        (hex) => hex.toLowerCase() !== brand && !/^#f[5-9a-f]f[5-9a-f]f[5-9a-f]$/i.test(hex),
      ),
      `${file} carries a hardcoded yellow beside BRAND`,
    ).toEqual([])
  })

  it.each(EMAIL_BUILDERS)('%s asks for Heebo before falling back', (file) => {
    // Hebrew RTL in Heebo, per the brand. Mail clients that will not load a
    // webfont fall through to Arial, which is why the stack still ends there.
    expect(read(file)).toContain('font-family:Heebo,Arial,Helvetica,sans-serif')
  })
})
