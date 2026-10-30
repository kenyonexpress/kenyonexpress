import { describe, expect, it } from 'vitest'
import { PUSHABLE_KINDS, PUSH_TRIGGERS, isPushSubscribable, pushContentFor } from './push'

const site = 'https://kenyonexpress.co.il'

describe('push triggers', () => {
  it('maps every trigger to a kind that can produce a push', () => {
    for (const t of Object.values(PUSH_TRIGGERS)) expect(PUSHABLE_KINDS).toContain(t.kind)
  })

  it('T-7 and T-1 build different expiry copy from the same kind', () => {
    const t7 = pushContentFor('expiry_t7', { voucher_id: 'v1' }, site)
    const t1 = pushContentFor('expiry_t1', { voucher_id: 'v1' }, site)
    expect(t7?.title).not.toBe(t1?.title)
    expect(t1?.title).toContain('מחר')
  })

  it('builds order, invoice and security notifications', () => {
    expect(pushContentFor('security_alert', { event: 'new_sign_in' }, site)?.data.url).toContain(
      '/account/security',
    )
    expect(
      pushContentFor('order_status', { order_id: 'o1', status: 'shipped' }, site),
    ).not.toBeNull()
    expect(pushContentFor('invoice_ready', { order_id: 'o1' }, site)).not.toBeNull()
  })

  it('is subscribable only with the public VAPID key', () => {
    expect(isPushSubscribable('')).toBe(false)
    expect(isPushSubscribable('k')).toBe(true)
  })
})
