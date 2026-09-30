import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_BODY_MAX,
  buildFeedbackNotice,
  feedbackRatingLabel,
  feedbackStars,
  orderFeedbackFromForm,
  orderFeedbackSchema,
} from './feedback'

/**
 * The pure half of private order feedback: what the form is allowed to say,
 * and what the owner's mail says about it. The "never public" promise is a
 * property of the table and the reads (247, the query, the action), but one
 * piece of it is checkable here: the notice tells the owner it is private,
 * and everything the customer typed is escaped before it reaches an HTML
 * mail client.
 */

const ORDER = '11111111-1111-4111-8111-111111111111'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('orderFeedbackSchema', () => {
  it('accepts a rating with no text, and trims the text it gets', () => {
    expect(orderFeedbackSchema.safeParse({ orderId: ORDER, rating: 4 }).success).toBe(true)
    const parsed = orderFeedbackSchema.safeParse({ orderId: ORDER, rating: 5, body: '  יופי  ' })
    expect(parsed.success && parsed.data.body).toBe('יופי')
  })

  it('refuses a rating outside 1..5, a fraction, and a non-uuid order', () => {
    for (const rating of [0, 6, 3.5, Number.NaN]) {
      const parsed = orderFeedbackSchema.safeParse({ orderId: ORDER, rating })
      expect(parsed.success, `rating ${rating}`).toBe(false)
      expect(!parsed.success && parsed.error.issues[0]?.message).toContain('דירוג')
    }
    expect(orderFeedbackSchema.safeParse({ orderId: 'nope', rating: 3 }).success).toBe(false)
  })

  it(`caps the text at ${FEEDBACK_BODY_MAX} characters`, () => {
    const ok = orderFeedbackSchema.safeParse({
      orderId: ORDER,
      rating: 3,
      body: 'א'.repeat(FEEDBACK_BODY_MAX),
    })
    expect(ok.success).toBe(true)
    const long = orderFeedbackSchema.safeParse({
      orderId: ORDER,
      rating: 3,
      body: 'א'.repeat(FEEDBACK_BODY_MAX + 1),
    })
    expect(long.success).toBe(false)
  })
})

describe('orderFeedbackFromForm', () => {
  it('reads the radio group as a number and the textarea as text', () => {
    const raw = orderFeedbackFromForm(form({ orderId: ORDER, rating: '4', body: 'טוב מאוד' }))
    expect(raw).toEqual({ orderId: ORDER, rating: 4, body: 'טוב מאוד' })
    expect(orderFeedbackSchema.safeParse(raw).success).toBe(true)
  })

  it('turns an unchecked rating into the rating message, not a NaN', () => {
    const raw = orderFeedbackFromForm(form({ orderId: ORDER }))
    const parsed = orderFeedbackSchema.safeParse(raw)
    expect(parsed.success).toBe(false)
    expect(!parsed.success && parsed.error.issues[0]?.message).toBe('בחרו דירוג בין 1 ל-5')
  })
})

describe('rating words', () => {
  it('names every score and draws it', () => {
    expect([1, 2, 3, 4, 5].map(feedbackRatingLabel)).toEqual([
      'גרוע',
      'לא טוב',
      'סביר',
      'טוב',
      'מצוין',
    ])
    expect(feedbackStars(4)).toBe('★★★★☆')
    expect(feedbackStars(0)).toBe('☆☆☆☆☆')
    expect(feedbackRatingLabel(9)).toBe('')
  })
})

describe('buildFeedbackNotice', () => {
  const base = {
    orderId: ORDER,
    rating: 2,
    body: null,
    customerEmail: 'dana@example.com',
    customerName: 'דנה',
    appUrl: 'https://kenyonexpress.co.il/',
  }

  it('puts the score in the subject and links the admin order page, once', () => {
    const notice = buildFeedbackNotice(base)
    expect(notice.subject).toBe('משוב על הזמנה 11111111: 2/5 לא טוב')
    expect(notice.text).toContain(`https://kenyonexpress.co.il/admin/orders/${ORDER}`)
    expect(notice.html).toContain(`href="https://kenyonexpress.co.il/admin/orders/${ORDER}"`)
    expect(notice.idempotencyKey).toBe(`order-feedback:${ORDER}`)
  })

  it('says it is private, in both bodies', () => {
    const notice = buildFeedbackNotice(base)
    expect(notice.text).toContain('לא מתפרסם באתר')
    expect(notice.html).toContain('לא מתפרסם באתר')
  })

  it('says so when there is no text, and shows the text when there is', () => {
    expect(buildFeedbackNotice(base).text).toContain('דירוג בלבד')
    const withBody = buildFeedbackNotice({ ...base, body: 'המשלוח איחר\nביומיים' })
    expect(withBody.text).toContain('המשלוח איחר\nביומיים')
    expect(withBody.html).toContain('white-space:pre-wrap')
    expect(withBody.html).not.toContain('דירוג בלבד')
  })

  it('escapes what the customer typed before it reaches an HTML mail client', () => {
    const notice = buildFeedbackNotice({
      ...base,
      customerName: '<b>x</b>',
      body: '<script>alert(1)</script> & "q"',
    })
    expect(notice.html).not.toContain('<script>')
    expect(notice.html).toContain('&lt;script&gt;')
    expect(notice.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(notice.html).toContain('&amp; &quot;q&quot;')
    // The plain-text copy is not HTML and keeps the characters.
    expect(notice.text).toContain('<script>alert(1)</script> & "q"')
  })

  it('falls back to the email, then to a generic word, when there is no name', () => {
    expect(buildFeedbackNotice({ ...base, customerName: null }).text).toContain(
      'לקוח: dana@example.com',
    )
    expect(
      buildFeedbackNotice({ ...base, customerName: '  ', customerEmail: null }).text,
    ).toContain('לקוח: לקוח')
  })
})
