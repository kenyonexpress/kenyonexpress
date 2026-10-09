/**
 * PITR status and enable planning against the management-API documents as
 * they were measured on 2026-10-08 (shapes verified against
 * https://api.supabase.com/api/v1-json: ListProjectAddonsResponse,
 * ApplyProjectAddonBody).
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PITR_VARIANT,
  MIN_COMPUTE_FOR_PITR,
  computeMeetsPitrFloor,
  pitrStatus,
  planPitrEnable,
  selectedVariant,
  variantMonthlyUsd,
} from './pitr-lib.mjs'
import { decodeKeychainToken } from './supabase-mgmt.mjs'

const BACKUPS = {
  region: 'eu-north-1',
  walg_enabled: true,
  pitr_enabled: false,
  backups: [
    {
      id: 1,
      is_physical_backup: true,
      status: 'COMPLETED',
      inserted_at: '2026-10-06T22:03:47.418Z',
    },
    {
      id: 2,
      is_physical_backup: true,
      status: 'COMPLETED',
      inserted_at: '2026-10-05T22:04:20.189Z',
    },
    { id: 3, is_physical_backup: true, status: 'PENDING', inserted_at: '2026-10-07T22:04:20.189Z' },
  ],
  physical_backup_data: {},
}

const ADDONS = {
  selected_addons: [],
  available_addons: [
    {
      type: 'compute_instance',
      name: 'Compute Instance',
      variants: [
        {
          id: 'ci_micro',
          name: 'Micro',
          price: {
            description: '$0.01344/hour (~$10/month)',
            type: 'usage',
            interval: 'hourly',
            amount: 0.01344,
          },
        },
        {
          id: 'ci_small',
          name: 'Small',
          price: {
            description: '$0.0206/hour (~$15/month)',
            type: 'usage',
            interval: 'hourly',
            amount: 0.0206,
          },
        },
        {
          id: 'ci_medium',
          name: 'Medium',
          price: {
            description: '$0.0822/hour (~$60/month)',
            type: 'usage',
            interval: 'hourly',
            amount: 0.0822,
          },
        },
      ],
    },
    {
      type: 'pitr',
      name: 'Point in time recovery',
      variants: [
        {
          id: 'pitr_7',
          name: '7 days',
          price: { description: '$100/month', type: 'fixed', interval: 'monthly', amount: 100 },
        },
        {
          id: 'pitr_14',
          name: '14 days',
          price: { description: '$200/month', type: 'fixed', interval: 'monthly', amount: 200 },
        },
        {
          id: 'pitr_28',
          name: '28 days',
          price: { description: '$400/month', type: 'fixed', interval: 'monthly', amount: 400 },
        },
      ],
    },
  ],
}

const withSelected = (...selected) => ({ ...ADDONS, selected_addons: selected })
const sel = (type, id) => ({ type, variant: { id, name: id, price: {} } })

describe('selectedVariant / compute floor', () => {
  it('reads nothing selected as Nano, below the floor', () => {
    expect(selectedVariant(ADDONS, 'compute_instance')).toBeNull()
    expect(selectedVariant(ADDONS, 'pitr')).toBeNull()
    expect(computeMeetsPitrFloor(ADDONS)).toBe(false)
  })

  it('Micro is below the floor, Small and above meet it, optimized suffixes rank by base size', () => {
    expect(computeMeetsPitrFloor(withSelected(sel('compute_instance', 'ci_micro')))).toBe(false)
    expect(computeMeetsPitrFloor(withSelected(sel('compute_instance', 'ci_small')))).toBe(true)
    expect(computeMeetsPitrFloor(withSelected(sel('compute_instance', 'ci_4xlarge')))).toBe(true)
    expect(
      computeMeetsPitrFloor(withSelected(sel('compute_instance', 'ci_24xlarge_optimized_cpu'))),
    ).toBe(true)
  })

  it('an unknown compute id counts as above the floor, so the planner never downgrades it', () => {
    // A wrong "below" would PATCH compute down to Small; a wrong "above" only
    // makes the PITR PATCH fail with the API's own error. The second is cheaper.
    expect(computeMeetsPitrFloor(withSelected(sel('compute_instance', 'ci_quantum')))).toBe(true)
    expect(
      planPitrEnable({ addons: withSelected(sel('compute_instance', 'ci_quantum')) }).steps.map(
        (s) => s.addon_type,
      ),
    ).toEqual(['pitr'])
  })
})

describe('variantMonthlyUsd', () => {
  it('parses the monthly figure out of fixed and usage descriptions', () => {
    expect(variantMonthlyUsd(ADDONS, 'pitr', 'pitr_7')).toBe(100)
    expect(variantMonthlyUsd(ADDONS, 'pitr', 'pitr_28')).toBe(400)
    expect(variantMonthlyUsd(ADDONS, 'compute_instance', 'ci_small')).toBe(15)
  })

  it('is null for an unknown variant', () => {
    expect(variantMonthlyUsd(ADDONS, 'pitr', 'pitr_90')).toBeNull()
    expect(variantMonthlyUsd({}, 'pitr', 'pitr_7')).toBeNull()
  })
})

describe('pitrStatus', () => {
  it('summarises the measured production documents', () => {
    const s = pitrStatus({
      backups: BACKUPS,
      addons: ADDONS,
      now: new Date('2026-10-07T06:00:00Z'),
    })
    expect(s).toMatchObject({
      pitrEnabled: false,
      walgEnabled: true,
      region: 'eu-north-1',
      completedBackups: 2,
      newestPlatformBackupAgeHours: 8,
      pitrVariant: null,
      computeVariant: 'ci_nano',
      computeMeetsFloor: false,
    })
    expect(s.pitrVariantsAvailable.map((v) => v.id)).toEqual(['pitr_7', 'pitr_14', 'pitr_28'])
  })

  it('reports the selected PITR variant when enabled', () => {
    const s = pitrStatus({
      backups: { ...BACKUPS, pitr_enabled: true },
      addons: withSelected(sel('compute_instance', 'ci_small'), sel('pitr', 'pitr_7')),
    })
    expect(s.pitrEnabled).toBe(true)
    expect(s.pitrVariant).toBe('pitr_7')
    expect(s.computeVariant).toBe('ci_small')
    expect(s.computeMeetsFloor).toBe(true)
  })

  it('tolerates empty documents', () => {
    const s = pitrStatus({ backups: {}, addons: {} })
    expect(s.completedBackups).toBe(0)
    expect(s.newestPlatformBackupAgeHours).toBeNull()
    expect(s.pitrVariantsAvailable).toEqual([])
  })
})

describe('planPitrEnable', () => {
  it('on Nano: upgrades compute to the floor first, then buys pitr_7, and totals the monthly cost', () => {
    const plan = planPitrEnable({ addons: ADDONS })
    expect(plan.steps.map((s) => [s.addon_type, s.addon_variant])).toEqual([
      ['compute_instance', MIN_COMPUTE_FOR_PITR],
      ['pitr', DEFAULT_PITR_VARIANT],
    ])
    expect(plan.monthlyUsd).toBe(115)
    expect(plan.steps[0].reason).toContain('ci_nano')
  })

  it('on Small or larger: only the PITR step', () => {
    const plan = planPitrEnable({
      addons: withSelected(sel('compute_instance', 'ci_medium')),
      variant: 'pitr_14',
    })
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({
      addon_type: 'pitr',
      addon_variant: 'pitr_14',
      monthlyUsd: 200,
    })
    expect(plan.monthlyUsd).toBe(200)
  })

  it('is a no-op when the requested variant is already selected', () => {
    const plan = planPitrEnable({
      addons: withSelected(sel('compute_instance', 'ci_small'), sel('pitr', 'pitr_7')),
      variant: 'pitr_7',
    })
    expect(plan.steps).toEqual([])
    expect(plan.monthlyUsd).toBe(0)
  })

  it('plans a variant change when PITR is on at another retention', () => {
    const plan = planPitrEnable({
      addons: withSelected(sel('compute_instance', 'ci_small'), sel('pitr', 'pitr_7')),
      variant: 'pitr_28',
    })
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].reason).toContain('pitr_7')
  })

  it('refuses an unknown variant before planning anything', () => {
    expect(() => planPitrEnable({ addons: ADDONS, variant: 'pitr_90' })).toThrow(
      /unknown PITR variant/,
    )
  })
})

describe('decodeKeychainToken', () => {
  it('decodes the go-keyring envelope the Supabase CLI writes and passes bare tokens through', () => {
    const b64 = Buffer.from('sbp_example_token\n', 'utf8').toString('base64')
    expect(decodeKeychainToken(`go-keyring-base64:${b64}\n`)).toBe('sbp_example_token')
    expect(decodeKeychainToken(' sbp_bare ')).toBe('sbp_bare')
    expect(decodeKeychainToken('')).toBeNull()
  })
})
