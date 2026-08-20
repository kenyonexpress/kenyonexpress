import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FloatingWhatsApp from './FloatingWhatsApp'

const supplier = {
  name: 'פיצה בעיר',
  contact_phone: '03-1234567',
  whatsapp: '052-4635550',
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el)

describe('<FloatingWhatsApp>', () => {
  it('links to the supplier in international form, never with the leading zero', () => {
    const out = html(<FloatingWhatsApp supplier={supplier} productName="דיל" enabled />)
    expect(out).toContain('https://wa.me/972524635550')
    expect(out).not.toContain('wa.me/052')
  })

  it('names the business in the accessible label', () => {
    const out = html(<FloatingWhatsApp supplier={supplier} productName="דיל" enabled />)
    expect(out).toContain('שליחת הודעה לפיצה בעיר בוואטסאפ')
  })

  it('pre-fills a message naming the product', () => {
    const out = html(<FloatingWhatsApp supplier={supplier} productName="עיסוי" enabled />)
    expect(decodeURIComponent(out)).toContain('עיסוי')
  })

  it('renders nothing until the supplier has opted in', () => {
    expect(html(<FloatingWhatsApp supplier={supplier} productName="דיל" enabled={false} />)).toBe(
      '',
    )
  })

  it('renders nothing when the only number on file is a landline', () => {
    const landlineOnly = { name: 'עסק', contact_phone: '03-1234567', whatsapp: null }
    expect(html(<FloatingWhatsApp supplier={landlineOnly} productName="דיל" enabled />)).toBe('')
  })

  it('renders nothing without a supplier at all', () => {
    expect(html(<FloatingWhatsApp supplier={null} productName="דיל" enabled />)).toBe('')
  })

  it('clears the store float and the sticky bar at the bottom of the screen', () => {
    const out = html(<FloatingWhatsApp supplier={supplier} productName="דיל" enabled />)
    expect(out).toContain('bottom-24')
    expect(out).toContain('end-5')
  })
})
