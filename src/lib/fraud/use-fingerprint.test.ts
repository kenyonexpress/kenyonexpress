import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeviceFingerprint } from './use-fingerprint'

const get = vi.fn(async () => ({ visitorId: 'visitor-1' }))
const load = vi.fn(async () => ({ get }))
vi.mock('@fingerprintjs/fingerprintjs', () => ({ default: { load } }))

describe('useDeviceFingerprint (C181)', () => {
  beforeEach(() => {
    get.mockClear()
    load.mockClear()
  })

  it('does not fingerprint while the page loads', async () => {
    const { result } = renderHook(() => useDeviceFingerprint())
    await new Promise((r) => setTimeout(r, 20))
    expect(load).not.toHaveBeenCalled()
    expect(result.current).toEqual({ fingerprint: null, loading: true })
  })

  it('fingerprints once, on the first interaction', async () => {
    const { result } = renderHook(() => useDeviceFingerprint())
    act(() => {
      document.dispatchEvent(new Event('pointerdown'))
      document.dispatchEvent(new Event('keydown'))
    })
    await waitFor(() => expect(result.current.fingerprint).toBe('visitor-1'))
    expect(result.current.loading).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('still settles when the library fails', async () => {
    load.mockRejectedValueOnce(new Error('blocked'))
    const { result } = renderHook(() => useDeviceFingerprint())
    act(() => {
      document.dispatchEvent(new Event('focusin'))
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.fingerprint).toBeNull()
  })
})
