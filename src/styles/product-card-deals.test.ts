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
 * 380, 768 and 1440 (F43). The deals title is 22px / 26.4px / weight 500 with
 * an 8px bottom margin on every width, over the body's -0.14px letter-spacing;
 * the price fields are line-height 1.714 (23.996 at 14px, 27.424 at 16px).
 * The old 32px / inherit-weight title was derived from the 64px wrap and put
 * every glyph row 3px low and one word early on the wrap.
 *
 * The numbers are split across four files on purpose, and this pins the split:
 * the shared base here, the deal card's own line/weight/margin as the
 * `--deal` modifier below it in this same file (it was a CSS module beside
 * the component until F44: a module is its own chunk and its own
 * render-blocking <link> on the homepage), the tokens in tokens.css, and the
 * letter-spacing on body in globals.css where live has it.
 */
describe('product-card-deals.css title and price type (F43)', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
  const css = read('./product-card-deals.css')
  const component = read('../components/ProductDealCard.tsx')
  const tokens = read('./tokens.css')
  const globals = read('../app/globals.css')
  const base = css.match(/\n\.p_con__title \{([^}]*)\}/)?.[1] ?? ''

  it('keeps the shared base at 22px with no line-height of its own', () => {
    expect(base).toMatch(/font-size:\s*22px;/)
    expect(base).not.toMatch(/line-height/)
    expect(base).not.toMatch(/line-height:\s*32px/)
    // One class, so the element-qualified modifier out-ranks it.
    expect(css).not.toMatch(/h2\.p_con__title\s*\{/)
  })

  it('gives the deal card live\u2019s 26.4px line, weight 500 and 8px margin in its modifier', () => {
    const rule = css.match(/\nh2\.p_con__title--deal \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/line-height:\s*var\(--leading-deal-title\);/)
    expect(rule).toMatch(/font-weight:\s*var\(--weight-medium\);/)
    expect(rule).toMatch(/margin:\s*0 0 8px;/)
  })

  it('applies the modifier next to the base class on the h2, with no module', () => {
    expect(component).not.toMatch(/\.module\.css/)
    expect(component).toMatch(/className="p_con__title p_con__title--deal"/)
  })

  it('declares the measured tokens', () => {
    expect(tokens).toMatch(/--leading-deal-title:\s*26\.4px;/)
    expect(tokens).toMatch(/--tracking-body:\s*-0\.14px;/)
  })

  it('puts live\u2019s letter-spacing on body, where it is inherited from', () => {
    const body = globals.match(/\nbody \{([^}]*)\}/)?.[1] ?? ''
    expect(body).toMatch(/letter-spacing:\s*var\(--tracking-body\);/)
  })

  it('gives both price fields live\u2019s 1.714 line-height', () => {
    for (const cls of ['p_con__strike', 'p_con__sale']) {
      const rule = css.match(new RegExp(`\\n\\.${cls} \\{([^}]*)\\}`))?.[1] ?? ''
      expect(rule, cls).toMatch(/line-height:\s*1\.714;/)
    }
  })
})
