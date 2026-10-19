import { describe, expect, it } from 'vitest'
import { CITIES, cityBySlugName } from './cities'

describe('cities', () => {
  it('lists twenty cities in the agreed order, first and last', () => {
    expect(CITIES).toHaveLength(20)
    expect(CITIES[0]?.name).toBe('תל אביב')
    expect(CITIES.at(-1)?.name).toBe('אילת')
  })
  it('has unique ascii slugs', () => {
    const slugs = CITIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(20)
    for (const s of slugs) expect(s).toMatch(/^[a-z-]+$/)
  })
  it('resolves by slug and refuses unknown', () => {
    expect(cityBySlugName('haifa')?.name).toBe('חיפה')
    expect(cityBySlugName('nowhere')).toBeNull()
  })
})
