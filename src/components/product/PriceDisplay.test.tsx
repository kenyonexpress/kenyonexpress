import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PriceDisplay, { savingsPercent, shekels } from './PriceDisplay'

describe('savingsPercent', () => {
  it('is a whole percent off the full value', () => {
    expect(savingsPercent(200, 80)).toBe(60)
    expect(savingsPercent(399, 199)).toBe(50)
  })

  it('rounds DOWN, so the badge never over-promises', () => {
    // 100 -> 66.67 is a 33.33% saving. 33, not 34.
    expect(savingsPercent(100, 66.67)).toBe(33)
  })

  it('claims nothing without a real gap', () => {
    expect(savingsPercent(null, 80)).toBe(0)
    expect(savingsPercent(undefined, 80)).toBe(0)
    expect(savingsPercent(0, 80)).toBe(0)
    expect(savingsPercent(80, 80)).toBe(0)
    expect(savingsPercent(80, 120)).toBe(0)
  })

  it('is computed in agorot, not on the shekel floats', () => {
    // 0.1 + 0.2 arithmetic in shekels drifts; in agorot it cannot.
    expect(savingsPercent(0.3, 0.1)).toBe(66)
  })
})

describe('shekels', () => {
  it('prints agorot only when the price has them', () => {
    expect(shekels(399)).toBe('₪399')
    expect(shekels(399.5)).toBe('₪399.5')
    expect(shekels(1234.5)).toBe('₪1,234.5')
  })
})

describe('<PriceDisplay>', () => {
  const html = (el: React.ReactElement) => renderToStaticMarkup(el)

  it('strikes the full value and prints the saving', () => {
    const out = html(<PriceDisplay fullPriceIls={200} priceIls={80} />)
    expect(out).toContain('<del')
    expect(out).toContain('₪200')
    expect(out).toContain('₪80')
    expect(out).toContain('חסכון')
    expect(out).toContain('60%')
  })

  it('omits the strike when the full value is not higher', () => {
    const out = html(<PriceDisplay fullPriceIls={80} priceIls={80} />)
    expect(out).not.toContain('<del')
    expect(out).not.toContain('חסכון')
  })

  it('omits the strike when there is no full value at all', () => {
    const out = html(<PriceDisplay fullPriceIls={null} priceIls={49.9} />)
    expect(out).not.toContain('<del')
    expect(out).toContain('₪49.9')
  })

  it('can suppress the badge while keeping the strike', () => {
    const out = html(<PriceDisplay fullPriceIls={200} priceIls={80} showSavings={false} />)
    expect(out).toContain('<del')
    expect(out).not.toContain('חסכון')
  })
})
