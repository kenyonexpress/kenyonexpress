/**
 * Tests for ntfy notification helpers.
 */

import { notify, notifyNewOrder } from './notifications'

describe('notify', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
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
    expect(console.error).toHaveBeenCalledWith('[notify] failed to send:', expect.any(Error))
  })

  it('logs error on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Server error', { status: 500 }))

    await notify('Test')

    expect(console.error).toHaveBeenCalledWith('[notify] ntfy returned', 500, 'Server error')
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
      amountShekels: '₪150.00',
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/kenyon-ofir-limit',
      expect.objectContaining({
        headers: expect.objectContaining({
          Title: 'New Order',
          Priority: 'high',
          Tags: 'moneybag,tada',
        }),
        body: expect.stringContaining('New order #01234567'),
      }),
    )
  })
})
