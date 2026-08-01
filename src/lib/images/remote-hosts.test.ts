import {
  REMOTE_IMAGE_PATTERNS,
  hostnameMatches,
  isAllowedImageUrl,
} from '@/lib/images/remote-hosts'
import { describe, expect, it } from 'vitest'

describe('hostnameMatches', () => {
  it('matches an exact hostname', () => {
    expect(hostnameMatches('picsum.photos', 'picsum.photos')).toBe(true)
    expect(hostnameMatches('picsum.photo', 'picsum.photos')).toBe(false)
  })

  it('matches exactly one label for a leading wildcard', () => {
    expect(hostnameMatches('abc.supabase.co', '*.supabase.co')).toBe(true)
    // next's rule, not a glob: no label and two labels both fail.
    expect(hostnameMatches('supabase.co', '*.supabase.co')).toBe(false)
    expect(hostnameMatches('a.b.supabase.co', '*.supabase.co')).toBe(false)
  })

  it('does not let a suffix that is not a label boundary through', () => {
    expect(hostnameMatches('evilsupabase.co', '*.supabase.co')).toBe(false)
    expect(hostnameMatches('supabase.co.evil.com', '*.supabase.co')).toBe(false)
  })
})

describe('isAllowedImageUrl', () => {
  it('accepts a same-origin path', () => {
    expect(isAllowedImageUrl('/images/products/h6-600x600.webp')).toBe(true)
  })

  it('accepts every host the optimizer is configured for', () => {
    const samples = [
      'https://ixvwfbuvfxxsjiywhbbb.supabase.co/storage/v1/object/public/p/a.webp',
      'https://images.unsplash.com/photo-1',
      'https://plus.unsplash.com/photo-2',
      'https://picsum.photos/seed/demo-coupon-8/600/600',
      'https://cdn.kenyonexpress.co.il/a.webp',
      'https://pub-123.r2.dev/a.webp',
    ]
    for (const url of samples) expect(isAllowedImageUrl(url), url).toBe(true)
  })

  it('rejects what next/image would throw on', () => {
    const bad = [
      'https://example.com/a.jpg',
      'https://cdn.example.com/a.jpg',
      // http and protocol-relative: the optimizer takes neither.
      'http://picsum.photos/seed/x/600/600',
      '//picsum.photos/seed/x/600/600',
      'data:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
      'not a url',
      '',
      '   ',
      null,
      undefined,
    ]
    for (const url of bad) expect(isAllowedImageUrl(url), String(url)).toBe(false)
  })

  it('rejects a host that merely contains an allowed one', () => {
    // The shape an attacker reaches for first, and the one a naive
    // `includes()` check would accept.
    expect(isAllowedImageUrl('https://picsum.photos.evil.com/a.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://evil.com/picsum.photos/a.jpg')).toBe(false)
  })

  it('keeps every pattern https, because the optimizer rejects http', () => {
    for (const p of REMOTE_IMAGE_PATTERNS) expect(p.protocol).toBe('https')
  })
})
