import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/order-feedback', () => ({ submitOrderFeedback: vi.fn() }))

import OrderFeedbackForm from './OrderFeedbackForm'

/**
 * The form's promise, in both states: private, once, and in Hebrew. With a
 * stored row it must not offer a second submission, because the owner has
 * already read the first.
 */

const ORDER = '11111111-1111-4111-8111-111111111111'

describe('<OrderFeedbackForm>', () => {
  it('opens with five stars, an optional text box, and the privacy line', () => {
    const html = renderToStaticMarkup(<OrderFeedbackForm orderId={ORDER} existing={null} />)
    expect(html).toContain('data-state="open"')
    expect(html).toContain('איך הייתה חוויית ההזמנה?')
    expect((html.match(/name="rating"/g) ?? []).length).toBe(5)
    expect(html).toContain('name="body"')
    expect(html).toContain('maxLength="1000"')
    expect(html).toContain(`name="orderId" value="${ORDER}"`)
    expect(html).toContain('נשלח לצוות קניון אקספרס בלבד ולא מתפרסם באתר')
    expect(html).toContain('שליחת משוב')
  })

  it('labels every star for a screen reader with its word', () => {
    const html = renderToStaticMarkup(<OrderFeedbackForm orderId={ORDER} existing={null} />)
    expect(html).toContain('1 כוכבים, גרוע')
    expect(html).toContain('5 כוכבים, מצוין')
  })

  it('shows a stored row read-only, with no second form', () => {
    const html = renderToStaticMarkup(
      <OrderFeedbackForm
        orderId={ORDER}
        existing={{ rating: 4, body: 'הגיע מהר', createdAt: '2026-10-01T08:00:00Z' }}
        existingDate="01.10.2026"
      />,
    )
    expect(html).toContain('data-state="sent"')
    expect(html).toContain('★★★★☆')
    expect(html).toContain('טוב')
    expect(html).toContain('נשלח ב-01.10.2026')
    expect(html).toContain('הגיע מהר')
    expect(html).toContain('תודה על המשוב')
    expect(html).toContain('לא מתפרסם באתר')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('name="rating"')
  })

  it('does not invent a text line when the stored row has none', () => {
    const html = renderToStaticMarkup(
      <OrderFeedbackForm
        orderId={ORDER}
        existing={{ rating: 5, body: null, createdAt: '2026-10-01T08:00:00Z' }}
      />,
    )
    expect(html).not.toContain('account-feedback__body')
    expect(html).toContain('מצוין')
  })
})
