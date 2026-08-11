import { describe, expect, it } from 'vitest'
import { RECURRING_MIGRATION_FILE, recurringSchemaError } from './recurring-schema-error'

describe('recurringSchemaError', () => {
  it('names the migration for the enum failure', () => {
    const notice = recurringSchemaError('invalid input value for enum product_type: "recurring"')
    expect(notice).toContain(RECURRING_MIGRATION_FILE)
    expect(notice).toContain('חיוב חודשי קבוע')
  })

  it('catches the missing-column failure PostgREST reports as PGRST204', () => {
    expect(
      recurringSchemaError(
        "Could not find the 'recurring_amount_agorot' column of 'products' in the schema cache",
      ),
    ).toContain(RECURRING_MIGRATION_FILE)
    expect(recurringSchemaError('column products.billing_interval does not exist')).toContain(
      RECURRING_MIGRATION_FILE,
    )
  })

  it('catches the missing subscriptions table', () => {
    expect(recurringSchemaError('relation "public.subscriptions" does not exist')).toContain(
      RECURRING_MIGRATION_FILE,
    )
  })

  it('passes an unrelated failure through untouched', () => {
    // The caller falls back to the real message. Rewriting every database error
    // into migration advice would hide a genuine constraint violation behind
    // advice that does not fix it.
    expect(recurringSchemaError('duplicate key value violates unique constraint')).toBeNull()
    expect(recurringSchemaError('new row violates row-level security policy')).toBeNull()
    expect(recurringSchemaError(null)).toBeNull()
    expect(recurringSchemaError('')).toBeNull()
  })

  it('does not rewrite a real error that merely mentions subscriptions', () => {
    // A foreign-key violation naming the table is about real rows, not a
    // missing migration, and the admin needs to see it as written.
    expect(
      recurringSchemaError(
        'update or delete on table "subscriptions" violates foreign key constraint',
      ),
    ).toBeNull()
  })
})
