import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: sonner }))

import {
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  type ToastKind,
  dismissToast,
  notify,
  toastId,
} from './toast'

const KINDS: ToastKind[] = ['success', 'error', 'info', 'warning']

/** The sonner call lands after the (mocked) dynamic import resolves. */
async function flush() {
  await vi.waitFor(() => {
    const calls = KINDS.reduce((n, k) => n + sonner[k].mock.calls.length, 0)
    expect(calls + sonner.dismiss.mock.calls.length).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  for (const k of KINDS) sonner[k].mockReset()
  sonner.dismiss.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('notify: the one toast API', () => {
  it('routes each kind to its sonner method with the kind’s own lifetime', async () => {
    for (const kind of KINDS) notify(kind, `הודעת ${kind}`)
    await vi.waitFor(() => {
      for (const kind of KINDS) expect(sonner[kind]).toHaveBeenCalledTimes(1)
    })
    for (const kind of KINDS) {
      expect(sonner[kind]).toHaveBeenCalledWith(`הודעת ${kind}`, {
        id: toastId(kind, `הודעת ${kind}`),
        duration: TOAST_DURATION_MS[kind],
        description: undefined,
        action: undefined,
      })
    }
  })

  it('an error outlives a warning, which outlives an info, which outlives a success', () => {
    expect(TOAST_DURATION_MS.success).toBeLessThan(TOAST_DURATION_MS.info)
    expect(TOAST_DURATION_MS.info).toBeLessThan(TOAST_DURATION_MS.warning)
    expect(TOAST_DURATION_MS.warning).toBeLessThan(TOAST_DURATION_MS.error)
    // Still an auto-dismiss: nothing here is Infinity, so the stack cannot fill
    // with refusals nobody closed.
    for (const kind of KINDS) expect(Number.isFinite(TOAST_DURATION_MS[kind])).toBe(true)
    expect(MAX_VISIBLE_TOASTS).toBe(3)
  })

  it('derives the id from the kind and the message, so a repeat is the same toast', async () => {
    const a = notify('success', 'נוסף להשוואה')
    const b = notify('success', 'נוסף להשוואה')
    const c = notify('error', 'נוסף להשוואה')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    await flush()
    await vi.waitFor(() => expect(sonner.success).toHaveBeenCalledTimes(2))
    expect(sonner.success.mock.calls[0]?.[1]).toMatchObject({ id: a })
    expect(sonner.success.mock.calls[1]?.[1]).toMatchObject({ id: a })
  })

  it('passes description, action, an explicit id and an explicit duration through', async () => {
    const onClick = vi.fn()
    const id = notify('error', 'אפשר להשוות עד 4 מוצרים', {
      description: 'הסירו מוצר מההשוואה כדי להוסיף אחר.',
      action: { label: 'להשוואה', onClick },
      id: 'compare-limit',
      duration: 1234,
    })
    expect(id).toBe('compare-limit')
    await flush()
    expect(sonner.error).toHaveBeenCalledWith('אפשר להשוות עד 4 מוצרים', {
      id: 'compare-limit',
      duration: 1234,
      description: 'הסירו מוצר מההשוואה כדי להוסיף אחר.',
      action: { label: 'להשוואה', onClick },
    })
  })

  it('keeps the order of two toasts raised before the import has resolved', async () => {
    notify('error', 'ההוספה נכשלה')
    notify('success', 'נוסף לעגלה')
    await flush()
    await vi.waitFor(() => expect(sonner.success).toHaveBeenCalledTimes(1))
    const errorAt = sonner.error.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const successAt = sonner.success.mock.invocationCallOrder[0] ?? -1
    expect(errorAt).toBeLessThan(successAt)
  })

  it('dismisses one toast by id, or all without one', async () => {
    dismissToast('compare-limit')
    dismissToast()
    await flush()
    await vi.waitFor(() => expect(sonner.dismiss).toHaveBeenCalledTimes(2))
    expect(sonner.dismiss).toHaveBeenNthCalledWith(1, 'compare-limit')
    expect(sonner.dismiss).toHaveBeenNthCalledWith(2, undefined)
  })
})

describe('notify when the sonner chunk fails to load', () => {
  it('drops the toast instead of throwing into the caller', async () => {
    vi.resetModules()
    vi.doMock('sonner', () => Promise.reject(new Error('Loading chunk 123 failed')))
    const fresh = await import('./toast')
    expect(() => fresh.notify('success', 'נוסף לעגלה')).not.toThrow()
    // Let the rejected import settle; an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 10))
    vi.doUnmock('sonner')
  })
})
