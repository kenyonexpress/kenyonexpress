import { describe, expect, it } from 'vitest'
import { absoluteUrl } from './site-url'

describe('absoluteUrl', () => {
  it('joins a site-relative path onto the origin', () => {
    expect(absoluteUrl('https://kenyonexpress.co.il', '/a/b.webp')).toBe(
      'https://kenyonexpress.co.il/a/b.webp',
    )
  })

  it('does not double the slash when the site carries one', () => {
    expect(absoluteUrl('https://kenyonexpress.co.il/', '/a.webp')).toBe(
      'https://kenyonexpress.co.il/a.webp',
    )
  })

  it('adds the slash when the path lacks one', () => {
    expect(absoluteUrl('https://kenyonexpress.co.il', 'a.webp')).toBe(
      'https://kenyonexpress.co.il/a.webp',
    )
  })

  it('leaves an absolute URL untouched, whatever the host or case', () => {
    expect(absoluteUrl('https://kenyonexpress.co.il', 'https://cdn.example/a.webp')).toBe(
      'https://cdn.example/a.webp',
    )
    expect(absoluteUrl('https://kenyonexpress.co.il', 'HTTPS://cdn.example/a.webp')).toBe(
      'HTTPS://cdn.example/a.webp',
    )
  })

  it('is null for nothing, so a caller omits the tag rather than emitting a bare origin', () => {
    expect(absoluteUrl('https://kenyonexpress.co.il', null)).toBeNull()
    expect(absoluteUrl('https://kenyonexpress.co.il', undefined)).toBeNull()
    expect(absoluteUrl('https://kenyonexpress.co.il', '  ')).toBeNull()
  })
})
