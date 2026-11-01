import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * C16 State Guards Tests
 *
 * Verify that the migration declares all required state transitions based on
 * the existing codebase state machines.
 */

describe('C16 state guards', () => {
  const migrationPath = resolve(
    process.cwd(),
    'migrations/pending/300_c16_payment_refund_infrastructure.sql',
  )
  const migrationSql = readFileSync(migrationPath, 'utf-8')

  describe('orders.status guard', () => {
    const validTransitions = [
      ['fulfilled', 'platform_settled'],
      ['fulfilled', 'refunded'],
      ['paid', 'fulfilled'],
      ['paid', 'partially_fulfilled'],
      ['paid', 'platform_settled'],
      ['paid', 'refunded'],
      ['partially_fulfilled', 'fulfilled'],
      ['partially_fulfilled', 'refunded'],
      ['pending', 'cancelled'],
      ['pending', 'paid'],
      ['platform_settled', 'refunded'],
    ]

    it('declares all valid transitions', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_orders_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch, 'orders status guard function not found').toBeTruthy()

      const guardBody = guardMatch![1]

      for (const [from, to] of validTransitions) {
        const pattern = new RegExp(`'${from}','${to}'`)
        expect(guardBody, `Missing transition: ${from} -> ${to}`).toMatch(pattern)
      }
    })

    it('allows no-op updates', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_orders_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch![1]).toContain('NEW.status = OLD.status')
      expect(guardMatch![1]).toContain('RETURN NEW')
    })

    it('allows NULL status', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_orders_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch![1]).toContain('NEW.status IS NULL OR OLD.status IS NULL')
    })

    it('raises 23514 on invalid transition', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_orders_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch![1]).toContain("ERRCODE = '23514'")
      expect(guardMatch![1]).toContain('illegal orders.status transition')
    })
  })

  describe('payments.status guard', () => {
    const validTransitions = [
      ['initiated', 'failed'],
      ['initiated', 'redirected'],
      ['initiated', 'succeeded'],
      ['platform_settled', 'refunded'],
      ['redirected', 'failed'],
      ['redirected', 'succeeded'],
      ['succeeded', 'platform_settled'],
      ['succeeded', 'refunded'],
    ]

    it('declares all valid transitions', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_payments_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch, 'payments status guard function not found').toBeTruthy()

      const guardBody = guardMatch![1]

      for (const [from, to] of validTransitions) {
        const pattern = new RegExp(`'${from}','${to}'`)
        expect(guardBody, `Missing transition: ${from} -> ${to}`).toMatch(pattern)
      }
    })

    it('forbids succeeded -> failed', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_payments_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch![1]).not.toContain("'succeeded','failed'")
    })

    it('forbids failed -> succeeded', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_payments_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch![1]).not.toContain("'failed','succeeded'")
    })
  })

  describe('order_items.settlement_status guard', () => {
    const validTransitions = [
      ['escrow_held', 'escrow_released'],
      ['escrow_held', 'redeemed'],
      ['escrow_held', 'refunded'],
      ['escrow_released', 'redeemed'],
      ['escrow_released', 'refunded'],
      ['paid', 'cancelled'],
      ['paid', 'platform_settled'],
      ['paid', 'redeemed'],
      ['paid', 'refunded'],
      ['paid', 'split_executed'],
      ['pending', 'cancelled'],
      ['pending', 'paid'],
      ['pending', 'refunded'],
      ['pending', 'split_executed'],
      ['platform_settled', 'redeemed'],
      ['platform_settled', 'refunded'],
      ['split_executed', 'redeemed'],
      ['split_executed', 'refunded'],
    ]

    it('declares all valid transitions', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_order_items_settlement_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      expect(guardMatch, 'settlement_status guard function not found').toBeTruthy()

      const guardBody = guardMatch![1]

      for (const [from, to] of validTransitions) {
        const pattern = new RegExp(`'${from}','${to}'`)
        expect(guardBody, `Missing transition: ${from} -> ${to}`).toMatch(pattern)
      }
    })

    it('allows redeemed from multiple states', () => {
      const guardMatch = migrationSql.match(
        /CREATE OR REPLACE FUNCTION public\.fn_order_items_settlement_status_guard\(\)([\s\S]*?)END\s*\$\$/,
      )
      const guardBody = guardMatch![1]

      expect(guardBody).toContain("'paid','redeemed'")
      expect(guardBody).toContain("'platform_settled','redeemed'")
      expect(guardBody).toContain("'split_executed','redeemed'")
      expect(guardBody).toContain("'escrow_held','redeemed'")
      expect(guardBody).toContain("'escrow_released','redeemed'")
    })
  })

  describe('trigger creation', () => {
    it('creates triggers conditionally based on table existence', () => {
      // Should use DO blocks to check if tables exist
      expect(migrationSql).toContain(
        "IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders')",
      )
      expect(migrationSql).toContain(
        "IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payments')",
      )
      expect(migrationSql).toContain(
        "IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_items')",
      )
    })

    it('drops existing triggers before creating', () => {
      expect(migrationSql).toContain('DROP TRIGGER IF EXISTS tg_orders_status_guard')
      expect(migrationSql).toContain('DROP TRIGGER IF EXISTS tg_payments_status_guard')
      expect(migrationSql).toContain(
        'DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard',
      )
    })

    it('sets BEFORE UPDATE trigger timing', () => {
      expect(migrationSql).toMatch(/BEFORE UPDATE ON public\.orders/)
      expect(migrationSql).toMatch(/BEFORE UPDATE ON public\.payments/)
      expect(migrationSql).toMatch(/BEFORE UPDATE ON public\.order_items/)
    })
  })
})
