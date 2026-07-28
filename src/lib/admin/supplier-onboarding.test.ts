import { describe, expect, it } from 'vitest'
import { onboardingSteps, summarizeOnboarding } from './supplier-onboarding'

const COMPLETE = {
  name: 'פלאפל הכרם',
  contact_phone: '050-1234567',
  address: 'הרצל 12, תל אביב',
  logo_url: 'https://cdn.example.com/logo.png',
  status: 'active',
}

const READY = {
  supplier: COMPLETE,
  activeMemberCount: 1,
  productCount: 3,
  publishedProductCount: 2,
}

describe('onboardingSteps', () => {
  it('reports every step done for a fully onboarded supplier', () => {
    expect(onboardingSteps(READY).every((s) => s.done)).toBe(true)
  })

  it('treats missing team access as blocking, not cosmetic', () => {
    // A supplier with no active member cannot honour a voucher the customer has
    // already paid for. supplier_members is what the portal reads to decide who
    // may scan.
    const steps = onboardingSteps({ ...READY, activeMemberCount: 0 })
    const members = steps.find((s) => s.key === 'members')
    expect(members?.done).toBe(false)
    expect(members?.blocking).toBe(true)
    expect(summarizeOnboarding({ ...READY, activeMemberCount: 0 }).canTrade).toBe(false)
  })

  it('treats having no products as incomplete but not blocking', () => {
    // A supplier with no products is new, not broken.
    const input = { ...READY, productCount: 0, publishedProductCount: 0 }
    const products = onboardingSteps(input).find((s) => s.key === 'products')
    expect(products?.done).toBe(false)
    expect(products?.blocking).toBe(false)
    expect(summarizeOnboarding(input).canTrade).toBe(true)
  })

  it('names the missing identity fields rather than saying "incomplete"', () => {
    const steps = onboardingSteps({
      ...READY,
      supplier: { name: 'ספק', status: 'active' },
    })
    const identity = steps.find((s) => s.key === 'identity')
    expect(identity?.done).toBe(false)
    expect(identity?.todo).toContain('טלפון')
    expect(identity?.todo).toContain('כתובת')
    expect(identity?.todo).toContain('לוגו')
  })

  it('blocks an inactive supplier even when everything else is filled', () => {
    const input = { ...READY, supplier: { ...COMPLETE, status: 'inactive' } }
    expect(summarizeOnboarding(input).canTrade).toBe(false)
  })

  it('counts products as done only once one of them is actually published', () => {
    const input = { ...READY, productCount: 5, publishedProductCount: 0 }
    const products = onboardingSteps(input).find((s) => s.key === 'products')
    expect(products?.done).toBe(false)
    expect(products?.todo).toContain('5')
  })

  it('reports progress as a fraction of the whole checklist', () => {
    const summary = summarizeOnboarding({
      supplier: { name: 'ספק', status: 'inactive' },
      activeMemberCount: 0,
      productCount: 0,
      publishedProductCount: 0,
    })
    expect(summary.doneCount).toBe(0)
    expect(summary.total).toBe(4)
    expect(summary.canTrade).toBe(false)
  })

  it('matches the live catalogue shape: identity complete except address and logo', () => {
    // Measured 2026-07-28: 11 of 11 suppliers lack an address and a logo.
    const summary = summarizeOnboarding({
      supplier: { name: 'ספק חי', contact_phone: '0501234567', status: 'active' },
      activeMemberCount: 0,
      productCount: 6,
      publishedProductCount: 6,
    })
    expect(summary.canTrade).toBe(false)
    expect(summary.steps.filter((s) => !s.done).map((s) => s.key)).toEqual(['identity', 'members'])
  })
})
