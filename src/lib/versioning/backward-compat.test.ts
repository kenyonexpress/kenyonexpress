import { describe, expect, it } from 'vitest'
import {
  type UpgradeStep,
  buildUpgradePath,
  defaultField,
  renameField,
  upgradePayload,
} from './backward-compat'

type Payload = Record<string, unknown>

const STEPS: UpgradeStep<Payload>[] = [
  { from: 'v1', to: 'v2', transform: renameField('qty', 'quantity') },
  { from: 'v2', to: 'v3', transform: defaultField('currency', 'ILS') },
]

describe('buildUpgradePath', () => {
  it('chains the steps in order', () => {
    expect(buildUpgradePath(STEPS, 'v1', 'v3').map((s) => `${s.from}->${s.to}`)).toEqual([
      'v1->v2',
      'v2->v3',
    ])
  })

  it('is empty when the caller is already current', () => {
    expect(buildUpgradePath(STEPS, 'v3', 'v3')).toEqual([])
  })

  it('throws on a gap rather than skipping it', () => {
    const gapped: UpgradeStep<Payload>[] = [
      { from: 'v1', to: 'v2', transform: renameField('qty', 'quantity') },
    ]
    expect(() => buildUpgradePath(gapped, 'v1', 'v3')).toThrow(RangeError)
  })

  it('refuses a downgrade', () => {
    expect(() => buildUpgradePath(STEPS, 'v3', 'v1')).toThrow(RangeError)
  })

  it('refuses two steps starting at the same version', () => {
    const ambiguous = [...STEPS, { from: 'v1', to: 'v2', transform: (p: Payload) => p }]
    expect(() => buildUpgradePath(ambiguous, 'v1', 'v3')).toThrow(TypeError)
  })

  it('refuses a step that does not move forward', () => {
    const stuck: UpgradeStep<Payload>[] = [{ from: 'v1', to: 'v1', transform: (p) => p }]
    expect(() => buildUpgradePath(stuck, 'v1', 'v2')).toThrow(RangeError)
  })

  it('rejects a non-version on either end', () => {
    expect(() => buildUpgradePath(STEPS, 'latest', 'v3')).toThrow(TypeError)
    expect(() => buildUpgradePath(STEPS, 'v1', 'newest')).toThrow(TypeError)
  })
})

describe('upgradePayload', () => {
  it('applies every step between the caller and current', () => {
    expect(upgradePayload({ qty: 3 }, 'v1', STEPS, 'v3')).toEqual({ quantity: 3, currency: 'ILS' })
  })

  it('returns a current payload untouched, by identity', () => {
    const payload = { quantity: 3, currency: 'ILS' }
    expect(upgradePayload(payload, 'v3', STEPS, 'v3')).toBe(payload)
  })

  it('walks v9 to v10 forwards, not backwards', () => {
    const wide: UpgradeStep<Payload>[] = [
      { from: 'v9', to: 'v10', transform: defaultField('added', true) },
    ]
    expect(upgradePayload({ a: 1 }, 'v9', wide, 'v10')).toEqual({ a: 1, added: true })
  })
})

describe('renameField', () => {
  it('moves the value and drops the old key', () => {
    expect(renameField('qty', 'quantity')({ qty: 2, sku: 'x' })).toEqual({ quantity: 2, sku: 'x' })
  })

  it('is a no-op when the old key is absent', () => {
    const payload = { quantity: 2 }
    expect(renameField('qty', 'quantity')(payload)).toBe(payload)
  })
})

describe('defaultField', () => {
  it('fills only what is missing', () => {
    expect(defaultField('currency', 'ILS')({ a: 1 })).toEqual({ a: 1, currency: 'ILS' })
  })

  it('never overwrites a value the caller sent, including falsy ones', () => {
    const zero = { discount: 0 }
    expect(defaultField('discount', 10)(zero)).toBe(zero)
    const empty = { note: '' }
    expect(defaultField('note', 'x')(empty)).toBe(empty)
  })
})
