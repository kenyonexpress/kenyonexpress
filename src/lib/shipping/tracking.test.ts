import { describe, expect, it } from 'vitest'
import {
  isActiveTrackingStatus,
  mergeTrackingEvents,
  normalizeCarrierStatus,
  timelineIndex,
  trackingTone,
} from './tracking'

describe('tracking status', () => {
  it('maps carrier vocabularies in Hebrew and English onto ours', () => {
    expect(normalizeCarrierStatus('Delivered')).toBe('delivered')
    expect(normalizeCarrierStatus('נמסר לנמען')).toBe('delivered')
    expect(normalizeCarrierStatus('Out for delivery')).toBe('out_for_delivery')
    expect(normalizeCarrierStatus('יצא לחלוקה')).toBe('out_for_delivery')
    expect(normalizeCarrierStatus('Returned to sender')).toBe('returned')
    expect(normalizeCarrierStatus('Delivery failed')).toBe('exception')
    expect(normalizeCarrierStatus('Label created')).toBe('label_created')
    expect(normalizeCarrierStatus('ממתין לאיסוף')).toBe('label_created')
    expect(normalizeCarrierStatus('Arrived at hub')).toBe('in_transit')
    expect(normalizeCarrierStatus(null)).toBe('in_transit')
  })

  it('keeps asking about anything not delivered or returned', () => {
    expect(isActiveTrackingStatus('in_transit')).toBe(true)
    expect(isActiveTrackingStatus('exception')).toBe(true)
    expect(isActiveTrackingStatus('delivered')).toBe(false)
    expect(isActiveTrackingStatus('returned')).toBe(false)
  })

  it('places statuses on the four-step timeline', () => {
    expect(timelineIndex(null)).toBe(1)
    expect(timelineIndex('label_created')).toBe(1)
    expect(timelineIndex('out_for_delivery')).toBe(2)
    expect(timelineIndex('delivered')).toBe(3)
    expect(trackingTone('delivered')).toBe('ok')
    expect(trackingTone('exception')).toBe('warn')
    expect(trackingTone('returned')).toBe('dead')
  })

  it('merges replayed histories without duplicates, newest first', () => {
    const a = {
      at: '2026-10-08T10:00:00.000Z',
      status: 'label_created' as const,
      description: 'x',
      location: null,
    }
    const b = {
      at: '2026-10-08T12:00:00.000Z',
      status: 'in_transit' as const,
      description: 'y',
      location: null,
    }
    const merged = mergeTrackingEvents([a], [b, a])
    expect(merged.map((e) => e.status)).toEqual(['in_transit', 'label_created'])
  })
})
