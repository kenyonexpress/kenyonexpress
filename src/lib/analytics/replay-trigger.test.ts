import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUGGY_SESSION_EVENT,
  BUGGY_SESSION_STORAGE_KEY,
  bindBugSignals,
  clearBuggySession,
  isIgnorableError,
  markSessionBuggy,
  readBuggySession,
} from './replay-trigger'

/**
 * The flag that turns a mounted-but-idle recorder on. Held to three things:
 * it persists for the tab (a retry after the error is on tape too), the
 * FIRST reason sticks (it is the one that explains the recording), and the
 * noise Sentry ignores does not raise it (a browser extension throwing is
 * not the site breaking).
 */
beforeEach(() => {
  clearBuggySession()
})

afterEach(() => {
  clearBuggySession()
})

describe('markSessionBuggy / readBuggySession', () => {
  it('starts clean', () => {
    expect(readBuggySession()).toBeNull()
  })

  it('stores the reason for the tab and announces it on the window', () => {
    const heard = vi.fn()
    window.addEventListener(BUGGY_SESSION_EVENT, heard)
    try {
      expect(markSessionBuggy('error_boundary')).toBe('error_boundary')
      expect(readBuggySession()).toBe('error_boundary')
      expect(window.sessionStorage.getItem(BUGGY_SESSION_STORAGE_KEY)).toBe('error_boundary')
      expect(heard).toHaveBeenCalledTimes(1)
      const event = heard.mock.calls[0]?.[0] as CustomEvent<{ reason: string }>
      expect(event.detail.reason).toBe('error_boundary')
    } finally {
      window.removeEventListener(BUGGY_SESSION_EVENT, heard)
    }
  })

  it('keeps the first reason and still re-announces a later signal', () => {
    const heard = vi.fn()
    window.addEventListener(BUGGY_SESSION_EVENT, heard)
    try {
      markSessionBuggy('unhandled_rejection')
      expect(markSessionBuggy('uncaught_error')).toBe('unhandled_rejection')
      expect(readBuggySession()).toBe('unhandled_rejection')
      expect(heard).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener(BUGGY_SESSION_EVENT, heard)
    }
  })

  it('reads an unknown stored value as no flag', () => {
    window.sessionStorage.setItem(BUGGY_SESSION_STORAGE_KEY, 'something-else')
    expect(readBuggySession()).toBeNull()
  })

  it('still announces when storage is blocked', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const heard = vi.fn()
    window.addEventListener(BUGGY_SESSION_EVENT, heard)
    try {
      expect(() => markSessionBuggy('uncaught_error')).not.toThrow()
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      setItem.mockRestore()
      window.removeEventListener(BUGGY_SESSION_EVENT, heard)
    }
  })
})

describe('isIgnorableError', () => {
  it('ignores the ResizeObserver noise and extension sources', () => {
    expect(isIgnorableError('ResizeObserver loop limit exceeded')).toBe(true)
    expect(isIgnorableError('ResizeObserver loop completed with undelivered notifications')).toBe(
      true,
    )
    expect(isIgnorableError('boom', 'chrome-extension://abc/content.js')).toBe(true)
    expect(isIgnorableError('boom', 'moz-extension://abc/content.js')).toBe(true)
  })

  it('does not ignore a real error from the page', () => {
    expect(isIgnorableError("Cannot read properties of undefined (reading 'price')")).toBe(false)
    expect(isIgnorableError('boom', 'https://kenyonexpress.co.il/_next/static/chunks/app.js')).toBe(
      false,
    )
    expect(isIgnorableError(null)).toBe(false)
  })
})

describe('bindBugSignals', () => {
  it('flags an uncaught error and an unhandled rejection, and unbinds cleanly', () => {
    const unbind = bindBugSignals(window)
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: '/app.js' }))
    expect(readBuggySession()).toBe('uncaught_error')

    clearBuggySession()
    // jsdom has no PromiseRejectionEvent; a plain event with `reason` is
    // what the listener reads.
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: new Error('rejected') }),
    )
    expect(readBuggySession()).toBe('unhandled_rejection')

    unbind()
    clearBuggySession()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom again' }))
    expect(readBuggySession()).toBeNull()
  })

  it('does not flag the ignorable noise', () => {
    const unbind = bindBugSignals(window)
    try {
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded' }),
      )
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'boom', filename: 'chrome-extension://x/y.js' }),
      )
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), {
          reason: 'ResizeObserver loop limit exceeded',
        }),
      )
      expect(readBuggySession()).toBeNull()
    } finally {
      unbind()
    }
  })
})
