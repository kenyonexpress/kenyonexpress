import { t } from '@/lib/i18n/messages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProductShareRow from './ProductShareRow'

describe('the product share row', () => {
  const html = renderToStaticMarkup(<ProductShareRow productId="p1" message="דיל מטורף ב-₪99" />)

  it('puts WhatsApp first, then Share, then Copy Link', () => {
    const wa = html.indexOf('whatsapp')
    const share = html.indexOf(t('share.shareLabel'))
    const copy = html.indexOf(t('share.copyLinkLabel'))
    expect(wa).toBeGreaterThan(-1)
    expect(share).toBeGreaterThan(wa)
    expect(copy).toBeGreaterThan(share)
  })

  it('does not render the desktop fallback channels until a click proved there is no native share', () => {
    expect(html).not.toContain(t('share.telegramLabel'))
    expect(html).not.toContain(t('share.emailLabel'))
  })

  it('carries the Hebrew "link copied" confirmation for the toast', () => {
    expect(t('share.linkCopied')).toBe('הקישור הועתק')
  })
})
