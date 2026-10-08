import { COMPARE_LIMIT, COMPARE_STORAGE_KEY } from '@/lib/compare/limit'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  rehydrateCompareOnce,
  resetCompareHydrationForTests,
  sanitizeCompareIds,
  useCompareStore,
} from './client-store'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'
const E = '55555555-5555-4555-8555-555555555555'

beforeEach(() => {
  localStorage.clear()
  resetCompareHydrationForTests()
})

describe('the compare list', () => {
  it('starts empty and unhydrated, so the server and the first paint agree', () => {
    const s = useCompareStore.getState()
    expect(s.ids).toEqual([])
    expect(s.hydrated).toBe(false)
  })

  it('adds in insertion order, which is the column order on the page', () => {
    const s = useCompareStore.getState()
    expect(s.add(B)).toEqual({ ok: true, added: true })
    expect(s.add(A)).toEqual({ ok: true, added: true })
    expect(useCompareStore.getState().ids).toEqual([B, A])
  })

  it('refuses the fifth instead of rotating the first out', () => {
    const s = useCompareStore.getState()
    for (const id of [A, B, C, D]) s.add(id)
    expect(useCompareStore.getState().ids).toHaveLength(COMPARE_LIMIT)
    expect(s.add(E)).toEqual({ ok: false, reason: 'full' })
    expect(useCompareStore.getState().ids).toEqual([A, B, C, D])
  })

  it('treats a repeated add as a no-op success', () => {
    const s = useCompareStore.getState()
    s.add(A)
    expect(s.add(A)).toEqual({ ok: true, added: false })
    expect(useCompareStore.getState().ids).toEqual([A])
  })

  it('ignores a synthetic id (the home deals rail carries ke-deal-NNNN)', () => {
    const s = useCompareStore.getState()
    expect(s.add('ke-deal-9132')).toEqual({ ok: true, added: false })
    expect(useCompareStore.getState().ids).toEqual([])
  })

  it('toggles: present removes, absent adds, full refuses', () => {
    const s = useCompareStore.getState()
    expect(s.toggle(A)).toEqual({ ok: true, added: true })
    expect(s.toggle(A)).toEqual({ ok: true, added: false })
    expect(useCompareStore.getState().ids).toEqual([])
    for (const id of [A, B, C, D]) s.add(id)
    expect(s.toggle(E)).toEqual({ ok: false, reason: 'full' })
  })

  it('clears and replaces', () => {
    const s = useCompareStore.getState()
    s.add(A)
    s.add(B)
    s.replace([B, 'junk', B, C])
    expect(useCompareStore.getState().ids).toEqual([B, C])
    s.clear()
    expect(useCompareStore.getState().ids).toEqual([])
  })
})

describe('persistence', () => {
  it('writes only the ids under its own key', () => {
    useCompareStore.getState().add(A)
    const raw = localStorage.getItem(COMPARE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> }
    expect(parsed.state).toEqual({ ids: [A] })
  })

  it('rehydrates once after mount, sanitising what storage held', async () => {
    localStorage.setItem(
      COMPARE_STORAGE_KEY,
      JSON.stringify({ state: { ids: [A, A, 'nope', B, C, D, E] }, version: 0 }),
    )
    rehydrateCompareOnce()
    await Promise.resolve()
    const s = useCompareStore.getState()
    expect(s.hydrated).toBe(true)
    expect(s.ids).toEqual([A, B, C, D])
  })

  it('survives a corrupt value in storage as an empty list', async () => {
    localStorage.setItem(COMPARE_STORAGE_KEY, '{"state":{"ids":"not-an-array"}}')
    rehydrateCompareOnce()
    await Promise.resolve()
    expect(useCompareStore.getState().ids).toEqual([])
    expect(useCompareStore.getState().hydrated).toBe(true)
  })
})

describe('sanitizeCompareIds', () => {
  it('keeps unique uuids up to the limit, in order', () => {
    expect(sanitizeCompareIds([B, A, B, 7, null, C, D, E])).toEqual([B, A, C, D])
    expect(sanitizeCompareIds(undefined)).toEqual([])
    expect(sanitizeCompareIds('x')).toEqual([])
  })
})
