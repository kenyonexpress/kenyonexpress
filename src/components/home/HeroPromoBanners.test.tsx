import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/**
 * UX06 (14.10.2026): the hero's left column, held to what was measured off
 * refs/ke_live_1440.png (logs/ux06/live-blocks.mjs) against the build of HEAD
 * (logs/ux06/before.json):
 *
 *   column   201 wide, not 200 (the slider was 729 from x335, one pixel in)
 *   blocks   min-height 197, hairline on blocks 2 and 3 only, column
 *            self-start, not h-full (it was 613 split three ways)
 *   copy     17px / 23px / 200, strong 700 at the same size (was 11 / 13 / 13)
 *   action   14px / 30px / 700, 18px disc, 8px gap, at the inline START with
 *            the copy (was self-end: the LEFT edge, 70px from its copy)
 *   image    110px, rotate(16deg), 30 below and 10 past the inline end
 *   hover    none; live has no :hover on `.da-media`
 *
 * The browser geometry (x336 for the slider, 593 for the column, the hairline
 * pixels) is e2e/hero-grid.spec.ts; this pins the numbers the geometry comes
 * from, so a tidy that rounds one of them fails a test instead of a capture.
 */

const SB = ELECTRO_HERO.sideBanners

const px = (n: number) => `${n}px`

function mount() {
  const { container } = render(<HeroPromoBanners />)
  const column = container.querySelector<HTMLElement>('[data-hero-promo]')
  if (!column) throw new Error('no promo column')
  const blocks = Array.from(column.querySelectorAll<HTMLElement>('[data-hero-promo-block]'))
  const links = blocks.map((b) => {
    const a = b.querySelector<HTMLAnchorElement>('a')
    if (!a) throw new Error('block without a link')
    return a
  })
  return { column, blocks, links }
}

describe('HeroPromoBanners (UX06)', () => {
  it('is 201 wide, hidden below lg, and does not stretch to the row', () => {
    const { column } = mount()
    expect(SB.width).toBe(201)
    expect(column.style.width).toBe(px(201))
    expect(column.style.minWidth).toBe(px(201))
    expect(column.style.flex).toBe('0 0 201px')
    expect(column.className).toMatch(/\bhidden\b/)
    expect(column.className).toMatch(/\blg:flex\b/)
    expect(column.className).toMatch(/\bself-start\b/)
    expect(column.className).not.toMatch(/\bh-full\b/)
    expect(column.getAttribute('dir')).toBe('rtl')
  })

  it('renders three blocks of min-height 197 with a hairline on the second and third only', () => {
    const { blocks, links } = mount()
    expect(blocks).toHaveLength(3)
    expect(SB.itemHeight).toBe(197)
    for (const a of links) {
      expect(a.style.minHeight).toBe(px(197))
      expect(a.style.padding).toBe(px(16))
      expect(a.className).toMatch(/\boverflow-hidden\b/)
    }
    expect(blocks[0]?.className).not.toMatch(/\bborder-t\b/)
    expect(blocks[1]?.className).toMatch(/\bborder-t\b/)
    expect(blocks[1]?.className).toMatch(/\bborder-border-alt\b/)
    expect(blocks[2]?.className).toMatch(/\bborder-t\b/)
    // The hairline is on the wrapper, not the link: border-box min-height on
    // the link would have eaten it and the column would be 591, not 593.
    for (const a of links) expect(a.className).not.toMatch(/\bborder-[tb]\b/)
  })

  it('links each block to a category and names it in Hebrew', () => {
    const { links } = mount()
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/category/hot-deals',
      '/category/vacation',
      '/category/restaurants-cafes',
    ])
    for (const a of links) {
      expect(a.textContent).toMatch(/\p{Script=Hebrew}/u)
      expect(a.textContent).toContain('לרכישה')
      expect(a.textContent).not.toMatch(/[A-Za-z]/)
    }
  })

  it("sets the copy at live's 17px / 23px / 200 with a 700 strong at the same size", () => {
    const { links } = mount()
    for (const a of links) {
      const text = a.querySelector<HTMLElement>('.da-text')
      if (!text) throw new Error('no copy')
      expect(text.style.fontSize).toBe(px(17))
      expect(text.style.lineHeight).toBe(px(23))
      expect(text.style.fontWeight).toBe('200')
      expect(text.className).toMatch(/\btext-start\b/)
      expect(text.className).not.toMatch(/\buppercase\b/)
      const strong = text.querySelector<HTMLElement>('strong')
      if (!strong) throw new Error('no emphasis')
      expect(strong.className).toMatch(/\bfont-bold\b/)
      // No size of its own: the 13px strong inside 11px copy is gone.
      expect(strong.style.fontSize).toBe('')
      // Every line's span carries no size either; the block sets it once.
      for (const span of Array.from(text.querySelectorAll<HTMLElement>(':scope > span'))) {
        expect(span.style.fontSize).toBe('')
      }
    }
  })

  it('renders the action row at 14px / 30px / 700 with an 18px disc, starting with the copy', () => {
    const { links } = mount()
    expect(SB.shopButtonSize).toBe(18)
    for (const a of links) {
      const action = a.querySelector<HTMLElement>('.da-action')
      if (!action) throw new Error('no action row')
      expect(action.style.fontSize).toBe(px(14))
      expect(action.style.lineHeight).toBe(px(30))
      expect(action.style.gap).toBe(px(8))
      expect(action.className).toMatch(/\bfont-bold\b/)
      expect(action.className).toMatch(/\bself-start\b/)
      expect(action.className).not.toMatch(/\bself-end\b/)
      expect(action.className).not.toMatch(/\bmt-/)
      const disc = action.querySelector<HTMLElement>('span[aria-hidden="true"]')
      if (!disc) throw new Error('no disc')
      expect(disc.style.width).toBe(px(18))
      expect(disc.style.height).toBe(px(18))
      expect(disc.className).toMatch(/\brounded-full\b/)
      expect(disc.className).toMatch(/\bbg-brand-secondary\b/)
      // Dark ink on the yellow: the brand-contrast gate refuses text-white on
      // bg-brand-secondary anywhere in src/, and the whole suite caught it.
      expect(disc.className).toMatch(/\btext-brand-dark\b/)
      expect(disc.className).not.toMatch(/\btext-white\b/)
      // Text first, disc after: in this RTL row the disc lands to the LEFT of
      // the text, as live's ::after does.
      expect(action.firstChild?.textContent?.trim()).toBe('לרכישה')
      expect(action.lastElementChild).toBe(disc)
    }
  })

  it('hangs a 110px picture 16deg off the bottom inline-end corner, behind the copy', () => {
    const { links } = mount()
    for (const a of links) {
      const img = a.querySelector<HTMLElement>('.da-media-left')
      if (!img) throw new Error('no image slot')
      expect(img.style.width).toBe(px(110))
      expect(img.style.height).toBe(px(110))
      expect(img.style.bottom).toBe(px(-30))
      expect(img.style.insetInlineEnd).toBe(px(-10))
      expect(img.style.transform).toBe('rotate(16deg)')
      expect(img.className).toMatch(/\babsolute\b/)
      expect(img.className).toMatch(/\bz-0\b/)
      expect(img.getAttribute('aria-hidden')).toBe('true')
      expect(img.querySelector('[data-awaiting-photography]')).not.toBeNull()
      const body = a.querySelector<HTMLElement>('.da-media-body')
      expect(body?.className).toMatch(/\bz-10\b/)
      expect(body?.className).toMatch(/\bjustify-center\b/)
    }
  })

  it("carries no hover tint or zoom: live's .da-media has no :hover rule", () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/home/HeroPromoBanners.tsx'),
      'utf8',
    )
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/hover:/)
    expect(code).not.toMatch(/scale-105/)
  })
})
