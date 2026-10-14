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

  it('stacks the phone footer at 18 over and 19 between', () => {
    expect(rule('.p_con__footer {')).toMatch(/gap:\s*19px/)
    expect(rule('.p_con__footer {')).toMatch(/margin-top:\s*18px/)
    expect(rule('.p_con__footer .p_con__prices')).toMatch(/line-height:\s*27px/)
  })
})
