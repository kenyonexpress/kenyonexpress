import { clubStanding } from '@/lib/club/tiers'
import { agorot } from '@/lib/money'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ClubTierCard from './ClubTierCard'

const now = new Date('2026-09-25T12:00:00Z')

describe('ClubTierCard', () => {
  it('names the tier, the twelve-month spend and the gap to the next tier as a bar', () => {
    const html = renderToStaticMarkup(
      <ClubTierCard standing={clubStanding(agorot(150_000), now)} />,
    )
    expect(html).toContain('data-tier="silver"')
    expect(html).toContain('מועדון הלקוחות')
    expect(html).toContain('כסף')
    expect(html).toContain('1,500')
    expect(html).toContain('לדרגת זהב')
    expect(html).toContain('data-progress="25"')
    // inline-size, the logical property: the bar grows from the inline start.
    expect(html).toContain('inline-size:25%')
    expect(html).toContain('25%')
    // No money float anywhere near the card: the strings come from formatIls over agorot.
    expect(html).not.toContain('1500.00')
  })

  it('at the top tier shows no bar and says so', () => {
    const html = renderToStaticMarkup(
      <ClubTierCard standing={clubStanding(agorot(2_000_000), now)} />,
    )
    expect(html).toContain('data-tier="platinum"')
    expect(html).toContain('הגעת לדרגה הגבוהה ביותר')
    expect(html).not.toContain('club-progress')
  })
})
