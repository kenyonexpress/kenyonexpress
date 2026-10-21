import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Grid item padding, measured in the live archive on 2026-10-20: the
 * `.jet-listing-grid__item` is 501 tall around a 485 card at 768 AND 1440,
 * and 548 around 532 at 380 -- 8px top and bottom at every width. A 72px
 * base value here put every card row 128px below live's from the second row
 * down and read as 41.82% (768) and 30.05% (1440).
 */
describe('product-card-deals.css grid item', () => {
  const css = fs.readFileSync(path.resolve(__dirname, './product-card-deals.css'), 'utf-8')

  it('pads the item 8px top and bottom in the base rule', () => {
    const base = css.match(/\n\.jet-listing-grid-deals__item \{([^}]*)\}/)?.[1] ?? ''
    expect(base).toMatch(/padding:\s*8px 0;/)
  })

  it('never reintroduces the 72px desktop padding', () => {
    expect(css).not.toMatch(/padding:\s*72px/)
  })

  it('squares the flagged thumbnail between 768 and 1023 only', () => {
    const rule =
      css.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(rule).toContain('.p_con__image[data-thumb-md="square"]')
    expect(rule).toMatch(/width:\s*245px/)
    expect(rule).toMatch(/object-position:\s*center center/)
  })
})

/**
 * Card title and price type, measured in the live archive on 2026-10-21 at
 * 380, 768 and 1440 (F43). The title is 22px / 26.4px / weight 500 /
 * letter-spacing -0.14px with an 8px bottom margin on every width; the price
 * fields are line-height 1.714 (23.996 at 14px, 27.424 at 16px). The old
 * 32px / inherit-weight title was derived from the 64px wrap and put every
 * glyph row 3px low and one word early on the wrap.
 */
describe('product-card-deals.css title and price type', () => {
  const css = fs.readFileSync(path.resolve(__dirname, './product-card-deals.css'), 'utf-8')
  const title =
    css.match(/\n\.p_con__title,\n\.jet-listing-grid-deals h2\.p_con__title \{([^}]*)\}/)?.[1] ?? ''

  it('sets the title to live\u2019s 22px / 26.4px at weight 500', () => {
    expect(title).toMatch(/font-size:\s*22px;/)
    expect(title).toMatch(/line-height:\s*26\.4px;/)
    expect(title).toMatch(/font-weight:\s*var\(--weight-medium\);/)
  })

  it('carries live\u2019s -0.14px letter-spacing and 8px bottom margin', () => {
    expect(title).toMatch(/letter-spacing:\s*-0\.14px;/)
    expect(title).toMatch(/margin:\s*0 0 8px;/)
  })

  it('never returns to the 32px line that was derived from the wrap height', () => {
    expect(title).not.toMatch(/line-height:\s*32px/)
    expect(title).not.toMatch(/font-weight:\s*inherit/)
  })

  it('gives both price fields live\u2019s 1.714 line-height', () => {
    for (const cls of ['p_con__strike', 'p_con__sale']) {
      const rule = css.match(new RegExp(`\\n\\.${cls} \\{([^}]*)\\}`))?.[1] ?? ''
      expect(rule, cls).toMatch(/line-height:\s*1\.714;/)
    }
  })
})
