import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAYMENT_EVENT_TYPES } from '@/server/payments/payment-events'
import type { RefundDestination, RefundGround, RefundState } from '@/server/payments/refund-record'
import { describe, expect, it } from 'vitest'

/**
 * C16 Schema Tests
 *
 * Verify that migration 300 declares the same enums that the TypeScript code uses.
 * A mismatch here means runtime 22P02 errors on the money path.
 */

describe('C16 migration schema', () => {
  const migrationPath = resolve(
    process.cwd(),
    'migrations/pending/300_c16_payment_refund_infrastructure.sql',
  )
  const migrationSql = readFileSync(migrationPath, 'utf-8')

  it('declares all payment_event_type values', () => {
    // Extract enum values from the SQL
    const enumMatch = migrationSql.match(
      /CREATE TYPE public\.payment_event_type AS ENUM \(([\s\S]*?)\);/,
    )
    if (!enumMatch?.[1]) {
      throw new Error('payment_event_type enum not found in migration')
    }

    const sqlValues = enumMatch[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)

    // Compare with TypeScript const
    expect(sqlValues).toEqual(PAYMENT_EVENT_TYPES)
  })

  it('declares refund_ground values matching TypeScript', () => {
    const expectedGrounds: RefundGround[] = [
      'distance_sale_14d',
      'defect',
      'service_not_provided',
      'duplicate_charge',
      'extended_window',
      'goodwill',
    ]

    const groundMatch = migrationSql.match(
      /CREATE TYPE public\.refund_ground AS ENUM \(([\s\S]*?)\);/,
    )
    if (!groundMatch?.[1]) {
      throw new Error('refund_ground enum not found')
    }

    const sqlGrounds = groundMatch[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)

    expect(sqlGrounds).toEqual(expectedGrounds)
  })

  it('declares refund_state values matching TypeScript', () => {
    const expectedStates: RefundState[] = [
      'requested',
      'approved',
      'rejected',
      'executing',
      'completed',
      'failed',
    ]

    const stateMatch = migrationSql.match(
      /CREATE TYPE public\.refund_state AS ENUM \(([\s\S]*?)\);/,
    )
    if (!stateMatch?.[1]) {
      throw new Error('refund_state enum not found')
    }

    const sqlStates = stateMatch[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)

    expect(sqlStates).toEqual(expectedStates)
  })

  it('declares refund_destination values matching TypeScript', () => {
    const expectedDestinations: RefundDestination[] = ['original_method', 'wallet']

    const destMatch = migrationSql.match(
      /CREATE TYPE public\.refund_destination AS ENUM \(([\s\S]*?)\);/,
    )
    if (!destMatch?.[1]) {
      throw new Error('refund_destination enum not found')
    }

    const sqlDestinations = destMatch[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)

    expect(sqlDestinations).toEqual(expectedDestinations)
  })

  it('creates payment_events table with required columns', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.payment_events')
    expect(migrationSql).toContain('event_type        public.payment_event_type NOT NULL')
    expect(migrationSql).toContain('amount_agorot     bigint')
    expect(migrationSql).toContain('external_event_id text')
    expect(migrationSql).toContain('detail            jsonb NOT NULL DEFAULT')
  })

  it('creates refunds table with required columns', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.refunds')
    expect(migrationSql).toContain('state                   public.refund_state')
    expect(migrationSql).toContain('ground                  public.refund_ground')
    expect(migrationSql).toContain('destination             public.refund_destination')
    expect(migrationSql).toContain('requested_agorot        bigint NOT NULL')
    expect(migrationSql).toContain('granted_agorot          bigint')
    expect(migrationSql).toContain('cancellation_fee_agorot bigint NOT NULL DEFAULT 0')
    expect(migrationSql).toContain('refund_due_by           timestamptz')
  })

  it('creates search_index_outbox table', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.search_index_outbox')
    expect(migrationSql).toContain('product_id  uuid NOT NULL')
    expect(migrationSql).toContain("op          text NOT NULL CHECK (op IN ('upsert','delete'))")
  })

  it('creates state guard functions', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.fn_orders_status_guard()')
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.fn_payments_status_guard()')
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION public.fn_order_items_settlement_status_guard()',
    )
  })

  it('enforces 5% cap on cancellation fee', () => {
    expect(migrationSql).toContain('refunds_fee_le_5pct_capped_100')
    expect(migrationSql).toContain('LEAST((requested_agorot + 19) / 20, 10000)')
  })

  it('enforces wallet refunds have zero fee', () => {
    expect(migrationSql).toContain('refunds_wallet_has_no_fee')
    expect(migrationSql).toContain("destination != 'wallet' OR cancellation_fee_agorot = 0")
  })

  it('creates 14-day deadline trigger', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.fn_refunds_force_due_by()')
    expect(migrationSql).toContain("interval '14 days'")
  })

  it('uses IF NOT EXISTS for idempotency', () => {
    const createStatements = migrationSql.match(/CREATE (TABLE|TYPE|INDEX)/gi) || []
    const ifNotExistsCount = migrationSql.match(/IF NOT EXISTS/gi)?.length || 0

    // Should have IF NOT EXISTS for most creates (not all, due to DO blocks for enums)
    expect(ifNotExistsCount).toBeGreaterThan(5)
  })

  it('enables RLS on all new tables', () => {
    expect(migrationSql).toContain('ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY')
    expect(migrationSql).toContain('ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY')
    expect(migrationSql).toContain(
      'ALTER TABLE public.search_index_outbox ENABLE ROW LEVEL SECURITY',
    )
  })

  it('revokes anon/authenticated access', () => {
    expect(migrationSql).toContain('REVOKE ALL ON public.payment_events FROM anon, authenticated')
    expect(migrationSql).toContain('REVOKE ALL ON public.refunds FROM anon, authenticated')
    expect(migrationSql).toContain(
      'REVOKE ALL ON public.search_index_outbox FROM anon, authenticated',
    )
  })
})
