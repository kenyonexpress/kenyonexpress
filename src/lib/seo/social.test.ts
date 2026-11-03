import { describe, expect, it } from 'vitest'
import { ROOT_CARD, socialMetadata } from './social'

describe('socialMetadata', () => {
  it('claims the root card for both og and twitter when the segment has none', () => {
    const m = socialMetadata({ title: 'שאלות נפוצות', description: 'd', path: '/faq' })
    expect(m.openGraph).toMatchObject({ title: 'שאלות נפוצות', url: '/faq', locale: 'he_IL' })
    expect(m.openGraph?.images).toEqual([{ url: ROOT_CARD, width: 1200, height: 630 }])
    expect(m.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'שאלות נפוצות',
      images: [ROOT_CARD],
    })
  })

  it('leaves images unset for a segment with its own card file', () => {
    const m = socialMetadata({ title: 't', description: 'd', path: '/product/x', ownCard: true })
    expect(m.openGraph && 'images' in m.openGraph).toBe(false)
    expect(m.twitter && 'images' in m.twitter).toBe(false)
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 't' })
  })
})
