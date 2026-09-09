/**
 * The PITR verdict. This is the function that decides whether a report says
 * "we can restore to any second in the last week" or "we can restore to
 * yesterday", and those two sentences buy very different incidents, so the
 * cases that matter are the ones where a lazy parser would answer confidently
 * and wrongly.
 */
import { describe, expect, it } from 'vitest'
import { EXIT, exitCodeFor, findPitrAddon, pitrVerdict } from './pitr-lib.mjs'

const withAddons = (selected) => ({ selected_addons: selected })

describe('findPitrAddon', () => {
  it('finds the add-on when variant is an object, the documented shape', () => {
    const found = findPitrAddon(
      withAddons([
        { type: { id: 'compute_instance' }, variant: { id: 'ci_micro' } },
        { type: { id: 'pitr' }, variant: { id: 'pitr_14' } },
      ]),
    )
    expect(found).toEqual({ variantId: 'pitr_14', retentionDays: 14 })
  })

  it('finds it when variant is a bare string, the shape the API has also shipped', () => {
    expect(findPitrAddon(withAddons([{ type: 'pitr', variant: 'pitr_7' }]))).toEqual({
      variantId: 'pitr_7',
      retentionDays: 7,
    })
  })

  it('never reads available_addons as state', () => {
    // The trap: a project that COULD buy PITR looks identical to one that did,
    // if you read the wrong array. Answering "yes" here is the whole bug.
    const payload = {
      selected_addons: [{ type: 'compute_instance', variant: 'ci_micro' }],
      available_addons: [{ type: 'pitr', variant: 'pitr_28' }],
    }
    expect(findPitrAddon(payload)).toBeNull()
  })

  it('is not fooled by an add-on whose name merely mentions pitr', () => {
    expect(
      findPitrAddon(withAddons([{ type: 'custom_domain', variant: 'cd_pitr_default' }])),
    ).toBeNull()
  })
})

describe('pitrVerdict', () => {
  it('reports the retention window and a two-minute RPO when applied', () => {
    const v = pitrVerdict(withAddons([{ type: 'pitr', variant: 'pitr_28' }]))
    expect(v.enabled).toBe(true)
    expect(v.retentionDays).toBe(28)
    expect(v.rpo).toBe('<= 2m')
  })

  it('reports 24h, the daily automatic backup, when the add-on is absent', () => {
    const v = pitrVerdict(withAddons([{ type: 'compute_instance', variant: 'ci_micro' }]))
    expect(v.enabled).toBe(false)
    expect(v.rpo).toBe('<= 24h')
  })

  it('an empty add-on list is a measurement, not an error', () => {
    expect(pitrVerdict(withAddons([])).enabled).toBe(false)
  })

  it('keeps "cannot tell" apart from "no", for every shape that is not a list', () => {
    for (const payload of [
      null,
      undefined,
      {},
      { message: 'Unauthorized' },
      { selected_addons: {} },
    ]) {
      expect(pitrVerdict(payload).enabled).toBeNull()
    }
  })
})

describe('exitCodeFor', () => {
  it('gives three distinct codes so CI can tell absent from broken', () => {
    expect(exitCodeFor({ enabled: true })).toBe(EXIT.ENABLED)
    expect(exitCodeFor({ enabled: false })).toBe(EXIT.DISABLED)
    expect(exitCodeFor({ enabled: null })).toBe(EXIT.CANNOT_MEASURE)
    expect(new Set(Object.values(EXIT)).size).toBe(3)
  })
})
