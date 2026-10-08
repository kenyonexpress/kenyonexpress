import { describe, expect, it } from 'vitest'
import { landingCampaignParams, withCampaignParams } from './campaign-links'

const PAGE = { slug: 'summer', campaign: null }

describe('landingCampaignParams', () => {
  it('defaults to the landing source, the page campaign and the rendered variant', () => {
    expect(landingCampaignParams(PAGE, 'b', null)).toEqual({
      utm_source: 'landing',
      utm_medium: 'lp',
      utm_campaign: 'summer',
      utm_content: 'b',
    })
    expect(
      landingCampaignParams({ slug: 'summer', campaign: 'sum26' }, 'control', null),
    ).toMatchObject({
      utm_campaign: 'sum26',
    })
  })

  it('lets the parameters the visitor arrived with win, key by key', () => {
    const params = landingCampaignParams(PAGE, 'b', {
      utm_source: 'facebook',
      utm_campaign: 'paid-july',
      utm_term: 'coupons',
    })
    expect(params).toEqual({
      utm_source: 'facebook',
      utm_medium: 'lp',
      utm_campaign: 'paid-july',
      utm_content: 'b',
      utm_term: 'coupons',
    })
  })
})

describe('withCampaignParams', () => {
  const params = { utm_source: 'landing', utm_campaign: 'summer' }

  it('appends to a bare internal path', () => {
    expect(withCampaignParams('/products', params)).toBe(
      '/products?utm_source=landing&utm_campaign=summer',
    )
  })

  it('keeps an existing query and fragment', () => {
    expect(withCampaignParams('/products?sort=new#top', params)).toBe(
      '/products?sort=new&utm_source=landing&utm_campaign=summer#top',
    )
  })

  it('never overwrites a key the link already carries', () => {
    expect(withCampaignParams('/products?utm_source=qr', params)).toBe(
      '/products?utm_source=qr&utm_campaign=summer',
    )
  })

  it('leaves external and protocol-relative hrefs alone', () => {
    expect(withCampaignParams('https://example.com/x', params)).toBe('https://example.com/x')
    expect(withCampaignParams('//evil.example/x', params)).toBe('//evil.example/x')
    expect(withCampaignParams('mailto:a@b.c', params)).toBe('mailto:a@b.c')
  })

  it('returns the href unchanged when there is nothing to add', () => {
    expect(withCampaignParams('/products', {})).toBe('/products')
  })
})
