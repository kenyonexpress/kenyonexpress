/**
 * Tests for ntfy notification helpers.
 */

import { log } from '@/lib/observability/log'
import { notify, notifyNewOrder } from './notifications'

describe('notify', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    vi.spyOn(log, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends message to ntfy.sh with default options', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('ok', { status: 200 }))

    await notify('Test message')

    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/kenyon-ofir-limit',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'Test message',
      }),
    )
  })

  it('includes title and priority when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('ok', { status: 200 }))

    await notify('Alert message', {
      title: 'Critical Alert',
      priority: 'urgent',
      tags: ['warning', 'alert'],
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/kenyon-ofir-limit',
      expect.objectContaining({
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          Title: 'Critical Alert',
          Priority: 'urgent',
          Tags: 'warning,alert',
        },
        body: 'Alert message',
      }),
    )
  })

  it('logs error but does not throw on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await expect(notify('Test')).resolves.toBeUndefined()
    expect(log.warn).toHaveBeenCalledWith('notify.send_failed', { err: expect.any(Error) })
  })

  it('logs error on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Server error', { status: 500 }))

    await notify('Test')

    expect(log.warn).toHaveBeenCalledWith('notify.ntfy_rejected', { status: 500 })
  })
})

describe('notifyNewOrder', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
  })

  it('formats and sends new order notification', async () => {
    await notifyNewOrder({
      orderId: '01234567-89ab-cdef-0123-456789abcdef',
      productTitle: 'קפה אספרסו',
      amountAgorot: 15000,
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/kenyon-ofir-limit',
      expect.objectContaining({
        headers: expect.objectContaining({
          Title: 'New Order',
          Priority: 'high',
          Tags: 'moneybag,tada',
        }),
        body: 'New order #01234567: קפה אספרסו ₪150.00',
      }),
    )
  })
})
