import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAN_KEYS, assertNoPan } from './data-rights'

describe('account data export never carries a PAN', () => {
  it('names the fields that must not appear', () => {
    expect(PAN_KEYS).toEqual(['card_number', 'pan', 'full_number', 'cvv', 'cvc', 'cardcom_token'])
  })

  it('accepts a shopper payload without card data', () => {
    expect(() =>
      assertNoPan(
        {
          profile: { email: 'a@b.co', full_name: 'לקוח' },
          orders: [{ id: '1', total_agorot: 4000 }],
        },
        'export',
      ),
    ).not.toThrow()
  })

  it('refuses a token or a card number anywhere in the tree', () => {
    expect(() => assertNoPan({ payment: { cardcom_token: 'tok_x' } }, 'export')).toThrow(/PAN/)
    expect(() => assertNoPan({ card_number: '4580' }, 'export')).toThrow(/PAN/)
  })
})

describe('payment_tokens schema never holds a PAN', () => {
  it('the generated types have last-4 and a processor token, not a card number', () => {
    const types = readFileSync(resolve(process.cwd(), 'src/types/database.ts'), 'utf8')
    const start = types.indexOf('payment_tokens: {')
    expect(start).toBeGreaterThan(0)
    const block = types.slice(start, types.indexOf('product_images: {', start))
    for (const forbidden of ['card_number', 'pan', 'full_number', 'cvv', 'cvc']) {
      expect(block.toLowerCase(), `payment_tokens gained a ${forbidden} column`).not.toContain(
        forbidden,
      )
    }
    expect(block).toContain('last_4')
    expect(block).toContain('cardcom_token')
  })
})
