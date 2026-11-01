import { describe, expect, it } from 'vitest'
import { isMissingPushRelation } from './store'

describe('isMissingPushRelation', () => {
  it.each([
    ['undefined_table from Postgres', { code: '42P01' }],
    ['schema-cache miss from PostgREST', { code: 'PGRST205' }],
    [
      'codeless does-not-exist message naming the table',
      { message: 'relation "public.push_subscriptions" does not exist' },
    ],
    [
      'codeless schema-cache message naming the table',
      { message: "Could not find the table 'public.push_subscriptions' in the schema cache" },
    ],
  ])('is true for %s', (_name, error) => {
    expect(isMissingPushRelation(error)).toBe(true)
  })

  it.each([
    ['null', null],
    ['a real failure', { code: '23505', message: 'duplicate key value' }],
    ['a different missing relation', { message: 'relation "public.wishlists" does not exist' }],
    ['an unrelated message', { message: 'permission denied for table push_subscriptions' }],
  ])('is false for %s, which must surface as an error', (_name, error) => {
    expect(isMissingPushRelation(error)).toBe(false)
  })
})
