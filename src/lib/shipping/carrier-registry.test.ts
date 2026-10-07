import { describe, expect, it } from 'vitest'
import {
  CARRIER_IDS,
  CARRIER_REGISTRY,
  carrierIdFromText,
  carrierService,
  isCarrierId,
  legacyCarrierText,
} from './carrier-registry'
import { resolveCarrier } from './carriers'

describe('carrier registry', () => {
  it('names exactly the three API carriers', () => {
    expect(CARRIER_IDS).toEqual(['israel_post', 'chita', 'yamit'])
    for (const id of CARRIER_IDS) expect(isCarrierId(id)).toBe(true)
    expect(isCarrierId('ups')).toBe(false)
    expect(isCarrierId(null)).toBe(false)
  })

  it('writes a legacy carrier text that carriers.ts resolves to the same label', () => {
    // The account page, the shipped mail and the SMS all go through
    // resolveCarrier; a label created through a provider must link exactly
    // like a label typed by hand.
    for (const id of CARRIER_IDS) {
      const resolved = resolveCarrier(legacyCarrierText(id), 'X1')
      expect(resolved?.label, id).toBe(CARRIER_REGISTRY[id].label)
    }
  })

  it('falls back to the default service for an unknown code', () => {
    expect(carrierService('chita', 'express').code).toBe('express')
    expect(carrierService('chita', 'nope').code).toBe('standard')
    expect(carrierService('israel_post', null).code).toBe('registered')
  })

  it('maps stored text back to an id and leaves foreign couriers alone', () => {
    expect(carrierIdFromText("צ'יטה")).toBe('chita')
    expect(carrierIdFromText('Israel Post')).toBe('israel_post')
    expect(carrierIdFromText('yamit')).toBe('yamit')
    expect(carrierIdFromText('israel_post')).toBe('israel_post')
    expect(carrierIdFromText('UPS')).toBeNull()
    expect(carrierIdFromText('')).toBeNull()
  })

  it('every service band is a positive inclusive range', () => {
    for (const id of CARRIER_IDS) {
      for (const s of CARRIER_REGISTRY[id].services) {
        expect(s.minDays).toBeGreaterThanOrEqual(1)
        expect(s.maxDays).toBeGreaterThanOrEqual(s.minDays)
      }
    }
  })
})
