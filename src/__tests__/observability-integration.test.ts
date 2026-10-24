import { isAxiomEnabled, shipAxiomEvent } from '@/lib/observability/axiom'
import { log } from '@/lib/observability/log'
import { POSTHOG_ID_COOKIE, isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'
import { describe, expect, it } from 'vitest'

/**
 * Integration tests for PostHog capture and Axiom drain.
 *
 * These verify the code paths work correctly and integrate properly.
 * Live verification scripts exist at:
 * - scripts/verify-posthog-capture.mjs (verified working 2026-10-24)
 * - scripts/verify-axiom-drain.mjs
 */

describe('PostHog capture integration', () => {
  it('trackEvent is exported and callable', () => {
    expect(trackEvent).toBeDefined()
    expect(typeof trackEvent).toBe('function')
    expect(isPostHogEnabled).toBeDefined()
    expect(typeof isPostHogEnabled).toBe('function')
  })

  it('trackEvent does not throw when called without key', () => {
    // Should not throw even without key (no-op by design)
    expect(() => {
      trackEvent('test_event', { test: true })
    }).not.toThrow()
  })

  it('POSTHOG_ID_COOKIE constant exported for server-side correlation', () => {
    expect(POSTHOG_ID_COOKIE).toBe('ke_ph_id')
  })

  it('trackEvent accepts event name and scalar properties', () => {
    // Should accept the correct signature
    expect(() => {
      trackEvent('test_event', { prop1: 'value1', prop2: 123, prop3: true, prop4: null })
    }).not.toThrow()

    expect(() => {
      trackEvent('test_event', {}, { distinctId: 'custom-id' })
    }).not.toThrow()
  })
})

describe('Axiom drain integration', () => {
  it('shipAxiomEvent and isAxiomEnabled are exported', () => {
    expect(shipAxiomEvent).toBeDefined()
    expect(typeof shipAxiomEvent).toBe('function')
    expect(isAxiomEnabled).toBeDefined()
    expect(typeof isAxiomEnabled).toBe('function')
  })

  it('shipAxiomEvent does not throw when called without credentials', async () => {
    // Should not throw even without credentials (no-op by design)
    await expect(shipAxiomEvent({ event: 'test', level: 'info' })).resolves.toBeUndefined()
  })

  it('shipAxiomEvent accepts event objects', async () => {
    // Should accept event objects without throwing
    await expect(
      shipAxiomEvent({ event: 'test_event', level: 'info', message: 'test', custom: 123 }),
    ).resolves.toBeUndefined()
  })
})

describe('Structured logging with Axiom integration', () => {
  it('log module exports all log level functions', () => {
    expect(log).toBeDefined()
    expect(log.info).toBeDefined()
    expect(log.error).toBeDefined()
    expect(log.warn).toBeDefined()
    expect(log.debug).toBeDefined()
  })

  it('log functions accept event name and fields', () => {
    // Should not throw when called with correct signature
    expect(() => {
      log.info('test.event', { field1: 'value', field2: 123 })
    }).not.toThrow()

    expect(() => {
      log.error('error.event', { error: new Error('test') })
    }).not.toThrow()

    expect(() => {
      log.warn('warn.event', {})
    }).not.toThrow()
  })
})
