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
