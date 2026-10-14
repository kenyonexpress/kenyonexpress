import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/product-card-deals.css'), 'utf8')

/**
 * The deal card title pitches its two lines at 26px, measured UX01
 * (14.10.2026) on refs/ke_live_1440.png (y977 -> y1003). The wrap's 64px
 * min-height is the slot, not the line box; the old 32px line-height was
 * derived from it and put the second line 9px low on every two-line title.
 */
describe('product-card-deals.css', () => {
  const rule = (selector: string) => {
    const at = css.indexOf(selector)
    expect(at, selector).toBeGreaterThanOrEqual(0)
    return css.slice(at, css.indexOf('}', at))
  }

  it('pitches the title at 26px and keeps the 64px slot', () => {
    expect(rule('.p_con__title,')).toMatch(/line-height:\s*26px/)
    expect(rule('.p_con__title-wrap')).toMatch(/min-height:\s*64px/)
  })

  it('below the desktop grid: a 24px/1.2 title over a 63px slot', () => {
    const at = css.indexOf('@media (max-width: 1199px)')
    expect(at).toBeGreaterThan(0)
    const block = css.slice(at, css.indexOf('@media', at + 1))
    expect(block).toMatch(/font-size:\s*24px/)
    expect(block).toMatch(/line-height:\s*1\.2\b/)
    expect(block).toMatch(/min-height:\s*63px/)
  })

  /**
   * UX09 (14.10.2026): one grid, one row height. The section is a CSS grid
   * with `grid-auto-rows: 1fr`, so every row takes the tallest card's height,
   * and the column count is live's (1 / 2 from 768 / 4 from 1200, measured in
   * the table above the item rule). A flex wrap would size each row alone.
   */
  it('is a one-column grid with equal auto rows, two columns from 768 and four from 1200', () => {
    const base = rule('.jet-listing-grid-deals {')
    expect(base).toMatch(/display:\s*grid/)
    expect(base).toMatch(/grid-template-columns:\s*repeat\(1, minmax\(0, 1fr\)\)/)
    expect(base).toMatch(/grid-auto-rows:\s*1fr/)
    expect(base).not.toMatch(/flex/)

    const at768 = css.indexOf('@media (min-width: 768px)')
    const block768 = css.slice(at768, css.indexOf('@media', at768 + 1))
    expect(block768).toMatch(/\.jet-listing-grid-deals \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/)

    const at1200 = css.indexOf('@media (min-width: 1200px)')
    const block1200 = css.slice(at1200, css.indexOf('@media', at1200 + 1))
    expect(block1200).toMatch(/\.jet-listing-grid-deals \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/)

    // No flex basis left on the item: the grid owns the column width now.
    expect(rule('.jet-listing-grid-deals__item {')).not.toMatch(/flex|max-width/)
  })

  /**
   * The two conditional slots hold their height without content: the
   * department row (24px, the line box) and the photograph (245px, live's
   * image height). Without these a card with no category was 40px short and
   * one with no thumbnail 245px short, and the grid above would have given
   * its whole row to the taller neighbours while the short card sat in a gap.
   */
  it('reserves the department row and the photograph slot', () => {
    expect(rule('.p_con__category {')).toMatch(/min-height:\s*24px/)
    expect(rule('.p_con__category {')).toMatch(/line-height:\s*24px/)
    expect(rule('.p_con__image-wrap {')).toMatch(/min-height:\s*245px/)
    expect(rule('.p_con__image {')).toMatch(/height:\s*245px/)
  })

  it('stacks the phone footer at 18 over and 19 between', () => {
    expect(rule('.p_con__footer {')).toMatch(/gap:\s*19px/)
    expect(rule('.p_con__footer {')).toMatch(/margin-top:\s*18px/)
    expect(rule('.p_con__footer .p_con__prices')).toMatch(/line-height:\s*27px/)
  })
})
