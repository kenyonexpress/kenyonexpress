import { describe, expect, it } from 'vitest'
import { isMissingPasskeyRelation } from './store'

describe('isMissingPasskeyRelation', () => {
  it.each([
    ['undefined_table from Postgres', { code: '42P01' }],
    ['schema-cache miss from PostgREST', { code: 'PGRST205' }],
    [
      'codeless does-not-exist message naming the table',
      { message: 'relation "public.webauthn_credentials" does not exist' },
    ],
    [
      'codeless schema-cache message naming the table',
      { message: "Could not find the table 'public.webauthn_credentials' in the schema cache" },
    ],
  ])('is true for %s', (_name, error) => {
    expect(isMissingPasskeyRelation(error)).toBe(true)
  })

  it.each([
    ['null', null],
    ['a real failure', { code: '23505', message: 'duplicate key value' }],
    ['a different missing relation', { message: 'relation "public.subscriptions" does not exist' }],
    ['an unrelated message', { message: 'permission denied for table webauthn_credentials' }],
  ])('is false for %s, which must surface as an error', (_name, error) => {
    expect(isMissingPasskeyRelation(error)).toBe(false)
  })
})
