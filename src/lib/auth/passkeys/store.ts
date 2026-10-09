/**
 * Typed access to `webauthn_credentials`, which migration 178 creates and
 * production does not have yet.
 *
 * Same story and same shape as lib/supabase/pending-schema.ts (the 135
 * tables), and deliberately a separate file: that one says "delete me when
 * 135 is applied", and tying 178's types to 135's lifecycle would make either
 * apply-day a breaking change for the other. WHEN 178 IS APPLIED: regenerate
 * database.ts, delete this file's row type and `passkeyTable`, and use the
 * client directly at the call sites in server/actions/passkeys.ts.
 *
 * Until then every read can come back "relation does not exist", and the
 * callers must treat that as "passkeys not available yet", never as a crash:
 * a login page whose optional extra is unmigrated still has to log people in.
 */

export interface PasskeyRow {
  id: string
  user_id: string
  public_key: string
  counter: number
  transports: string[]
  device_type: string
  backed_up: boolean
  aaguid: string | null
  friendly_name: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
}

/** What the management UI needs; RLS lets the caller read only their own. */
export interface PasskeySummary {
  id: string
  friendly_name: string | null
  device_type: string
  backed_up: boolean
  last_used_at: string | null
  created_at: string
}

/**
 * Names the table the generated types do not know, for `.from()`. The only
 * place this file asserts anything, same confinement as `pendingTable`.
 */
export function passkeyTable(): never {
  return 'webauthn_credentials' as never
}

/**
 * Whether a PostgREST error means "178 has not been applied" rather than a
 * real failure. 42P01 is Postgres undefined_table; PGRST205 is PostgREST's
 * schema-cache miss, which is what the REST API actually returns. The message
 * fallback covers the window where the error arrives with neither code.
 */
export function isMissingPasskeyRelation(
  error: {
    code?: string
    message?: string
  } | null,
): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('webauthn_credentials') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  )
}
