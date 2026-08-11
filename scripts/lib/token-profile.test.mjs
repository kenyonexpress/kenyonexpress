import { describe, expect, it } from 'vitest'
import { compareProfiles, normalizeValue, profilePage } from './token-profile.mjs'

const box = (w, h, style, extra = {}) => ({ x: 0, y: 0, w, h, style, ...extra })

describe('normalizeValue', () => {
  it('keeps only the first font family, unquoted and lowercased', () => {
    expect(normalizeValue('font-family', '"Open Sans", Arial, sans-serif')).toBe('open sans')
    expect(normalizeValue('font-family', '__Heebo_a1b2c3, Heebo, sans-serif')).toBe(
      '__heebo_a1b2c3',
    )
  })

  it('leaves every other property verbatim', () => {
    expect(normalizeValue('color', 'rgb(51, 62, 72)')).toBe('rgb(51, 62, 72)')
    expect(normalizeValue('font-size', '14px')).toBe('14px')
  })

  it('rounds a length to a tenth of a pixel, so 23.996px and 24px are one value', () => {
    expect(normalizeValue('line-height', '23.996px')).toBe('24px')
    expect(normalizeValue('line-height', '24px')).toBe('24px')
  })

  it('keeps a difference a designer would call a difference', () => {
    expect(normalizeValue('border-radius', '4.5px')).toBe('4.5px')
    expect(normalizeValue('border-radius', '4px')).toBe('4px')
  })

  it('rounds every token of a multi-value length', () => {
    expect(normalizeValue('border-radius', '3.999px 4.001px 0px 0px')).toBe('4px 4px 0px 0px')
  })

  it('does not round numbers that are not lengths', () => {
    expect(normalizeValue('line-height', 'normal')).toBe('normal')
    expect(normalizeValue('font-weight', '400')).toBe('400')
    expect(normalizeValue('color', 'rgba(0, 0, 0, 0.7)')).toBe('rgba(0, 0, 0, 0.7)')
  })

  it('reports a missing value rather than dropping it', () => {
    expect(normalizeValue('color', '')).toBe('(unset)')
    expect(normalizeValue('color', undefined)).toBe('(unset)')
  })
})

describe('profilePage', () => {
  it('weights each value by the area of the boxes carrying it', () => {
    const profile = profilePage([
      box(100, 100, { color: 'rgb(0, 0, 0)' }),
      box(100, 300, { color: 'rgb(255, 0, 0)' }),
    ])
    expect(profile.totalArea).toBe(40000)
    expect(profile.dist.color.get('rgb(0, 0, 0)')).toBeCloseTo(0.25, 10)
    expect(profile.dist.color.get('rgb(255, 0, 0)')).toBeCloseTo(0.75, 10)
  })

  it('ignores zero-area boxes but still lets them set the page height', () => {
    const profile = profilePage([
      box(100, 100, { color: 'rgb(0, 0, 0)' }),
      { ...box(0, 0, { color: 'rgb(255, 0, 0)' }), y: 5000 },
    ])
    expect(profile.totalArea).toBe(10000)
    expect(profile.dist.color.has('rgb(255, 0, 0)')).toBe(false)
    expect(profile.pageHeight).toBe(5000)
  })

  it('measures page height from the box that reaches lowest, not from the first', () => {
    const profile = profilePage([
      { ...box(100, 4000, {}), y: 0 },
      { ...box(100, 200, {}), y: 4800 },
    ])
    expect(profile.pageHeight).toBe(5000)
  })

  it('does not divide by zero when every box is empty', () => {
    const profile = profilePage([box(0, 0, { color: 'rgb(0, 0, 0)' })])
    expect(profile.totalArea).toBe(0)
    expect(profile.dist.color.size).toBe(0)
  })
})

describe('compareProfiles', () => {
  it('scores an identical page at 0%', () => {
    const elements = [
      box(100, 100, { color: 'rgb(0, 0, 0)', 'font-size': '14px' }),
      box(100, 100, { color: 'rgb(255, 0, 0)', 'font-size': '16px' }),
    ]
    const report = compareProfiles(profilePage(elements), profilePage(elements))
    expect(report.overallPct).toBe(0)
  })

  it('scores two pages with no token in common at 100%', () => {
    const live = profilePage([box(100, 100, { color: 'rgb(0, 0, 0)' })])
    const mine = profilePage([box(100, 100, { color: 'rgb(255, 255, 255)' })])
    const color = compareProfiles(live, mine).props.find((p) => p.prop === 'color')
    expect(color.pct).toBe(100)
  })

  it('scores half the area moving to another value at 50%', () => {
    const live = profilePage([
      box(100, 100, { color: 'rgb(0, 0, 0)' }),
      box(100, 100, { color: 'rgb(0, 0, 0)' }),
    ])
    const mine = profilePage([
      box(100, 100, { color: 'rgb(0, 0, 0)' }),
      box(100, 100, { color: 'rgb(255, 0, 0)' }),
    ])
    const color = compareProfiles(live, mine).props.find((p) => p.prop === 'color')
    expect(color.pct).toBe(50)
  })

  it('names the value responsible for the gap, with both sides of it', () => {
    const live = profilePage([box(100, 100, { 'font-size': '14px' })])
    const mine = profilePage([box(100, 100, { 'font-size': '18px' })])
    const size = compareProfiles(live, mine).props.find((p) => p.prop === 'font-size')
    expect(size.worst[0]).toMatchObject({ gap: 1 })
    expect(['14px', '18px']).toContain(size.worst[0].value)
    expect(size.worst.map((w) => w.value).sort()).toEqual(['14px', '18px'])
  })

  it('treats a property absent on one side as that side spending no area on it', () => {
    const live = profilePage([box(100, 100, { 'border-radius': '8px' })])
    const mine = profilePage([box(100, 100, {})])
    const radius = compareProfiles(live, mine).props.find((p) => p.prop === 'border-radius')
    expect(radius.pct).toBe(100)
    expect(radius.worst[0].mine).toBe(0)
  })
})
