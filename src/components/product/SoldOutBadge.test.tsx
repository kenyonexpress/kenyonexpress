import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SoldOutBadge from './SoldOutBadge'

describe('<SoldOutBadge>', () => {
  it('says a physical product ran out of stock', () => {
    const out = renderToStaticMarkup(<SoldOutBadge />)
    expect(out).toContain('אזל מהמלאי')
    expect(out).not.toContain('הדיל נסגר')
  })

  it('says a coupon deal closed, because a coupon has no stock to run out of', () => {
    const out = renderToStaticMarkup(<SoldOutBadge isCoupon />)
    expect(out).toContain('הדיל נסגר')
    expect(out).not.toContain('אזל מהמלאי')
  })
})
