/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CTA_COPY_EXPERIMENT, HOME_HERO_EXPERIMENT } from './experiments'

const getVariant = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/feature-flags', () => ({
  getVariant: (...args: unknown[]) => getVariant(...args),
}))

import { useExperimentVariant } from './use-experiment-variant'

type Deferred = { resolve: (value: string) => void; promise: Promise<string> }
function deferred(): Deferred {
  let resolve: (value: string) => void = () => {}
  const promise = new Promise<string>((r) => {
    resolve = r
  })
  return { resolve, promise }
}

beforeEach(() => {
  getVariant.mockReset()
})

describe('useExperimentVariant', () => {
  it('renders control first and switches once the decision lands', async () => {
    const decision = deferred()
    getVariant.mockReturnValue(decision.promise)
    const { result } = renderHook(() => useExperimentVariant(HOME_HERO_EXPERIMENT))

    expect(result.current).toBe('control')
    await act(async () => {
      decision.resolve('static_hero')
      await decision.promise
    })
    expect(result.current).toBe('static_hero')
    expect(getVariant).toHaveBeenCalledWith(HOME_HERO_EXPERIMENT)
  })

  it('stays on control, with no update, when the browser is not in the experiment', async () => {
    getVariant.mockResolvedValue('control')
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useExperimentVariant(CTA_COPY_EXPERIMENT)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBe('control')
    expect(renders).toBe(1)
  })

  it('ignores a decision that lands after unmount', async () => {
    const decision = deferred()
    getVariant.mockReturnValue(decision.promise)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() => useExperimentVariant(HOME_HERO_EXPERIMENT))
    unmount()
    await act(async () => {
      decision.resolve('no_benefit_bar')
      await decision.promise
    })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('asks once per experiment, not once per render', () => {
    getVariant.mockResolvedValue('control')
    const { rerender } = renderHook(() => useExperimentVariant(HOME_HERO_EXPERIMENT))
    rerender()
    rerender()
    expect(getVariant).toHaveBeenCalledTimes(1)
  })
})
