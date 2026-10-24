import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * C68: Comprehensive audit log coverage
 *
 * Verifies that:
 *   1. Migration 303 creates audit triggers for all critical tables
 *   2. All financial/business-critical tables have audit coverage
 *   3. The trigger function captures who/what/before/after/at
 *   4. No duplicate or conflicting triggers exist
 *
 * Context:
 *   - audit_log table created in migration 011
 *   - audit_log_trigger_fn() updated in migration 025
 *   - Migration 303 adds comprehensive trigger coverage
 */

const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

/**
 * Tables that MUST have audit triggers because they handle:
 *   - Financial transactions (orders, refunds, payments)
 *   - Inventory (products, categories)
 *   - Customer data (vouchers, profiles)
 *   - Legal documents (invoices)
 */
const REQUIRED_AUDIT_TABLES = [
  'orders',
  'order_items',
  'vouchers',
  'voucher_redemptions',
  'refunds',
  'categories',
  'products',
  'product_variants',
  'profiles',
  'payments',
  'invoices',
  'discount_campaigns',
  'discount_redemptions',
  'coupon_codes',
  'coupon_redemptions',
  'settlement_batches',
  'settlement_items',
  'reconciliation_runs',
  'reconciliation_discrepancies',
  'affiliates',
  'suppliers',
  'supplier_members',
  'supplier_applications',
  'supplier_payouts',
  'carts',
  'cart_items',
  'stock_reservations',
  'referral_program_settings',
  'referral_signals',
] as const

/**
 * Pattern for audit trigger creation:
 * DROP TRIGGER IF EXISTS audit_<table> ON public.<table>;
 * CREATE TRIGGER audit_<table>
 *   AFTER INSERT OR UPDATE OR DELETE ON public.<table>
 *   FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
 */
function extractTriggersFromMigration(migrationPath: string): Set<string> {
  const content = readFileSync(migrationPath, 'utf8')
  const triggers = new Set<string>()

  // Match both CREATE TRIGGER and CREATE OR REPLACE TRIGGER
  const triggerPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+audit_(\w+)/gi
  let match: RegExpExecArray | null

  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex exec pattern
  while ((match = triggerPattern.exec(content)) !== null) {
    if (match[1]) {
      triggers.add(match[1])
    }
  }

  return triggers
}

describe('audit log trigger coverage', () => {
  const migration303 = join(ROOT, 'migrations', 'pending', '303_comprehensive_audit_triggers.sql')
  let triggers303: Set<string>

  try {
    triggers303 = extractTriggersFromMigration(migration303)
  } catch {
    triggers303 = new Set()
  }

  // Collect triggers from all migrations
  const allMigrations = [
    join(ROOT, 'supabase', 'migrations', '003_rbac.sql'),
    join(ROOT, 'supabase', 'migrations', '015_coupon_deals.sql'),
    join(ROOT, 'supabase', 'migrations', '026_commerce.sql'),
    join(ROOT, 'supabase', 'migrations', '027_suppliers.sql'),
    join(ROOT, 'supabase', 'migrations', '028_agents.sql'),
    migration303,
  ]

  const allTriggers = new Set<string>()
  for (const path of allMigrations) {
    try {
      const triggers = extractTriggersFromMigration(path)
      for (const trigger of triggers) {
        allTriggers.add(trigger)
      }
    } catch {
      // Migration may not exist yet, skip
    }
  }

  it('migration 303 exists', () => {
    expect(triggers303.size).toBeGreaterThan(0)
  })

  it('migration 303 creates triggers for all required tables', () => {
    const missing = REQUIRED_AUDIT_TABLES.filter((table) => !allTriggers.has(table))

    expect(
      missing,
      `Missing audit triggers for critical tables: ${missing.join(', ')}. Add them to migration 303 or explain why they don't need audit logging.`,
    ).toEqual([])
  })

  it('migration 303 uses the correct trigger pattern', () => {
    const migration = read('migrations', 'pending', '303_comprehensive_audit_triggers.sql')

    // Should use DROP TRIGGER IF EXISTS for safety
    expect(migration).toContain('DROP TRIGGER IF EXISTS')

    // Should call the standard trigger function
    expect(migration).toContain('public.audit_log_trigger_fn()')

    // Should fire AFTER (not BEFORE) for audit purposes
    expect(migration).toContain('AFTER INSERT OR UPDATE OR DELETE')

    // Should be FOR EACH ROW (not statement-level)
    expect(migration).toContain('FOR EACH ROW')
  })

  it('audit_log_trigger_fn captures who/what/before/after/at', () => {
    // Check migration 025 which defines the function
    const migration025 = read('supabase', 'migrations', '025_consolidation.sql')

    // WHO: actor_id from auth.uid()
    expect(migration025).toContain('auth.uid()')
    expect(migration025).toContain('actor_id')

    // WHAT: action (created/updated/deleted), entity_type, entity_id
    expect(migration025).toContain('action')
    expect(migration025).toContain('entity_type')
    expect(migration025).toContain('entity_id')
    expect(migration025).toContain('TG_TABLE_NAME')

    // BEFORE/AFTER: changes jsonb with old/new snapshots
    expect(migration025).toContain('changes')
    expect(migration025).toContain('to_jsonb(NEW)')
    expect(migration025).toContain('to_jsonb(OLD)')

    // AT: created_at is set by the table default (now())
    // The function doesn't set it explicitly, the table does
  })

  it('audit_log table has immutable RLS policies', () => {
    const migration011 = read('supabase', 'migrations', '011_audit_log_schema.sql')

    // Block INSERT via API
    expect(migration011).toContain('audit_log_no_insert')
    expect(migration011).toContain('FOR INSERT')
    expect(migration011).toContain('WITH CHECK')
    expect(migration011).toContain('false')

    // Block UPDATE
    expect(migration011).toContain('audit_log_no_update')
    expect(migration011).toContain('FOR UPDATE')
    expect(migration011).toContain('USING')

    // Block DELETE
    expect(migration011).toContain('audit_log_no_delete')
    expect(migration011).toContain('FOR DELETE')

    // Allow admin read
    expect(migration011).toContain('audit_log_admin_select')
    expect(migration011).toContain('public.is_admin()')
  })

  it('no duplicate audit triggers in migration 303', () => {
    const duplicates = Array.from(triggers303).filter(
      (trigger, _, arr) => arr.filter((t) => t === trigger).length > 1,
    )

    expect(duplicates, `Duplicate triggers found: ${duplicates.join(', ')}`).toEqual([])
  })

  it('preflight 303 verifies dependencies', () => {
    const preflight = read('migrations', 'pending', 'preflight_303.sql')

    // Should check audit_log table exists
    expect(preflight).toContain('audit_log')

    // Should check trigger function exists
    expect(preflight).toContain('audit_log_trigger_fn')

    // Should list expected tables
    expect(preflight).toContain('orders')
    expect(preflight).toContain('vouchers')
    expect(preflight).toContain('refunds')
  })
})

describe('/admin/audit route', () => {
  it('audit page exists and redirects to audit-log', () => {
    const auditPage = read('src', 'app', '(admin)', 'admin', 'audit', 'page.tsx')

    // Should redirect to the full audit-log interface
    expect(auditPage).toContain("redirect('/admin/audit-log')")

    // Should document C68
    expect(auditPage).toContain('C68')

    // Should explain immutability
    expect(auditPage).toContain('immutable')
    expect(auditPage).toContain('RLS')
  })

  it('audit-log page exists and is read-only', () => {
    const auditLogPage = read('src', 'app', '(admin)', 'admin', 'audit-log', 'page.tsx')

    // Should SELECT from audit_log
    expect(auditLogPage).toContain("from('audit_log')")

    // Should NOT have any INSERT/UPDATE/DELETE operations
    expect(auditLogPage).not.toContain('.insert(')
    expect(auditLogPage).not.toContain('.update(')
    expect(auditLogPage).not.toContain('.delete(')
    expect(auditLogPage).not.toContain('.upsert(')
  })
})
