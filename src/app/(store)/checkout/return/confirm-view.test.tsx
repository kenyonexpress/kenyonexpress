import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BusinessDetails from './BusinessDetails'
import OrderOverview from './OrderOverview'

const page = readFileSync(join(process.cwd(), 'src/app/(store)/checkout/return/page.tsx'), 'utf8')

describe('OrderOverview (V03)', () => {
  it('names each fact as a term and its value', () => {
    render(
      <OrderOverview orderNumber="9E9A14E3" date="3 בנובמבר 2026" total="₪120" email="a@b.co" />,
    )
    expect(screen.getByText('מספר הזמנה')).toBeTruthy()
    expect(screen.getByTestId('order-number').textContent).toBe('9E9A14E3')
    expect(screen.getByTestId('order-total').textContent).toBe('₪120')
    expect(screen.getByText('a@b.co')).toBeTruthy()
    expect(document.querySelectorAll('dt')).toHaveLength(4)
  })

  it('drops the email row for a guest and the date row when unpaid', () => {
    render(<OrderOverview orderNumber="X" date="" total="₪1" email={null} />)
    expect(document.querySelectorAll('dt')).toHaveLength(2)
  })
})

describe('BusinessDetails (V03)', () => {
  it('shows the name, the address and both map links for a street address', () => {
    render(<BusinessDetails supplier={{ name: 'ספא', address: 'הרצל 5', city: 'חיפה' }} />)
    expect(screen.getByText('ספא')).toBeTruthy()
    expect(screen.getByText('הרצל 5, חיפה')).toBeTruthy()
    expect(screen.getByTestId('map-waze').getAttribute('href')).toContain('waze.com/ul?q=')
    expect(screen.getByTestId('map-google').getAttribute('href')).toContain(
      'google.com/maps/search/?api=1&query=',
    )
  })

  it('offers no map link for a city alone', () => {
    render(<BusinessDetails supplier={{ name: 'ספא', address: null, city: 'חיפה' }} />)
    expect(screen.getByText('חיפה')).toBeTruthy()
    expect(screen.queryByTestId('map-waze')).toBeNull()
    expect(screen.queryByTestId('map-google')).toBeNull()
  })

  it('renders nothing with no name and no address', () => {
    const { container } = render(<BusinessDetails supplier={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('never renders a phone link', () => {
    render(<BusinessDetails supplier={{ name: 'ספא', address: 'הרצל 5', city: null }} />)
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })
})

describe('the thank-you page (V03)', () => {
  it('keeps the heading the money-path specs wait on', () => {
    const he = JSON.parse(readFileSync(join(process.cwd(), 'messages/he.json'), 'utf8'))
    expect(he.checkout.confirm.title).toBe('התשלום הצליח!')
    expect(page).toContain("t('checkout.confirm.title')")
  })

  it('renders the order overview, the business block, the invoice and the way back', () => {
    for (const piece of [
      '<OrderOverview',
      '<BusinessDetails',
      '<InvoiceDownloadLink',
      'data-testid="coupon-code"',
      'data-testid="coupon-qr"',
      'href="/products"',
    ]) {
      expect(page, piece).toContain(piece)
    }
  })

  it('prints whole shekels only', () => {
    expect(page).not.toMatch(/(?<!`)\bshekels\(/)
    expect(page).toContain('shekelsRounded(')
  })
})
