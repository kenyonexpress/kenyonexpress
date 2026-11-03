import { describe, expect, it } from 'vitest'
import { cityAliasTarget } from './city-alias'

describe('cityAliasTarget', () => {
  it('leaves a city page alone', () => {
    expect(cityAliasTarget('/c/tel-aviv')).toBeNull()
    expect(cityAliasTarget('/c/haifa/')).toBeNull()
  })

  it('sends any other slug to the category route', () => {
    expect(cityAliasTarget('/c/electronics')).toBe('/category/electronics')
    expect(cityAliasTarget('/c/pets/')).toBe('/category/pets')
  })

  it('keeps an encoded Hebrew segment encoded', () => {
    const seg = encodeURIComponent('חופשות')
    expect(cityAliasTarget(`/c/${seg}`)).toBe(`/category/${seg}`)
  })

  it('ignores the index, deeper paths and other routes', () => {
    expect(cityAliasTarget('/c')).toBeNull()
    expect(cityAliasTarget('/c/')).toBeNull()
    expect(cityAliasTarget('/c/a/b')).toBeNull()
    expect(cityAliasTarget('/category/pets')).toBeNull()
    expect(cityAliasTarget('/cart')).toBeNull()
  })

  it('refuses a malformed escape instead of throwing', () => {
    expect(cityAliasTarget('/c/%E0%A4%A')).toBeNull()
  })
})
