import { describe, expect, it } from 'vitest'
import { WHATSAPP_MIGRATION_FILE, whatsappSchemaError } from './whatsapp-schema-error'

describe('whatsappSchemaError', () => {
  it('names the file for the PGRST204 an un-migrated database returns', () => {
    const notice = whatsappSchemaError(
      "Could not find the 'whatsapp_enabled' column of 'products' in the schema cache",
    )
    expect(notice).toContain(WHATSAPP_MIGRATION_FILE)
  })

  it('handles the plain postgres phrasing too', () => {
    expect(whatsappSchemaError('column products.whatsapp_enabled does not exist')).toContain(
      WHATSAPP_MIGRATION_FILE,
    )
  })

  it('leaves every unrelated failure alone', () => {
    // Null, not a generic fallback: the caller must surface the real error.
    // Collapsing everything into "apply the migration" hides genuine failures
    // behind advice that does not fix them.
    expect(whatsappSchemaError('duplicate key value violates unique constraint')).toBeNull()
    expect(whatsappSchemaError('permission denied for table products')).toBeNull()
    expect(whatsappSchemaError('')).toBeNull()
    expect(whatsappSchemaError(null)).toBeNull()
    expect(whatsappSchemaError(undefined)).toBeNull()
  })

  it('does not rewrite a real error that merely mentions the column', () => {
    // A NOT NULL or CHECK violation naming whatsapp_enabled is a fact about a
    // row, not a missing migration. Sending an admin to apply a migration that
    // is already applied is worse than showing the raw message.
    expect(
      whatsappSchemaError('null value in column "whatsapp_enabled" violates not-null constraint'),
    ).toBeNull()
    expect(
      whatsappSchemaError('new row violates check constraint "products_whatsapp_enabled_chk"'),
    ).toBeNull()
  })
})
