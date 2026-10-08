import { describe, expect, it } from 'vitest'
import { referralShareText } from './share'

const ORIGIN = 'https://kenyonexpress.co.il'

describe('referralShareText', () => {
  it('puts the channelled link on its own line at the end, so every app unfurls it', () => {
    const { url, text } = referralShareText({
      code: 'AB12CD34',
      origin: ORIGIN,
      channel: 'whatsapp',
      friendBonusLabel: '₪10',
      minOrderLabel: '₪50',
    })
    expect(url).toContain('/?ref=AB12CD34')
    expect(url).toContain('utm_source=whatsapp')
    expect(text.endsWith(`\n${url}`)).toBe(true)
  })

  it('repeats the friend bonus and the minimum the page read from the live terms', () => {
    const { text } = referralShareText({
      code: 'AB12CD34',
      origin: ORIGIN,
      channel: 'copy',
      friendBonusLabel: '₪10',
      minOrderLabel: '₪50',
    })
    expect(text).toContain('₪10')
    expect(text).toContain('₪50')
    expect(text).toContain('קאשבק')
  })

  it('promises the friend nothing when the programme pays them nothing', () => {
    const { text } = referralShareText({
      code: 'AB12CD34',
      origin: ORIGIN,
      channel: 'share',
      friendBonusLabel: null,
      minOrderLabel: '₪50',
    })
    expect(text).not.toContain('קאשבק')
    expect(text).not.toContain('₪')
    expect(text).toContain('ref=AB12CD34')
  })

  it('carries no money of its own: every shekel in the text came in as a label', () => {
    const { text } = referralShareText({
      code: 'AB12CD34',
      origin: ORIGIN,
      channel: 'whatsapp',
      friendBonusLabel: 'X',
      minOrderLabel: 'Y',
    })
    expect(text).not.toContain('₪')
    expect(text).toContain('X')
    expect(text).toContain('Y')
  })
})
