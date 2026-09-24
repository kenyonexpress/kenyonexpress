import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CouponExpirySelect from './CouponExpirySelect'

describe('coupon expiry select', () => {
  it('offers exactly 30, 60 and 90 days plus an empty choice', () => {
    const html = renderToStaticMarkup(<CouponExpirySelect />)
    expect(html).toContain('value="30"')
    expect(html).toContain('value="60"')
    expect(html).toContain('value="90"')
    expect(html).toContain('value=""')
    expect(html.match(/<option/g)).toHaveLength(4)
  })

  it('keeps a legacy value selectable instead of rewriting it', () => {
    const html = renderToStaticMarkup(<CouponExpirySelect defaultValue={45} />)
    expect(html).toContain('value="45"')
    expect(html.match(/<option/g)).toHaveLength(5)
  })

  it('does not add a legacy option for a preset value', () => {
    const html = renderToStaticMarkup(<CouponExpirySelect defaultValue={60} />)
    expect(html.match(/<option/g)).toHaveLength(4)
  })

  it('posts under the field name the server schema reads', () => {
    expect(renderToStaticMarkup(<CouponExpirySelect />)).toContain('name="coupon_expiry_days"')
  })
})
