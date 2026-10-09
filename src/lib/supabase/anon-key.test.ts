import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAnonKey, requireAnonKey } from './anon-key'

// The precedence IS the rotation procedure (docs/RUNBOOK.md): during a swap
// the server carries the new key in SUPABASE_ANON_KEY while the built bundle
// still inlines the old NEXT_PUBLIC_ value. If the order ever flips, the
// server silently stays on the old key and the "zero-downtime" window closes
// on live traffic instead.

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  saved.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // Not `delete`: biome's noDelete, and assigning undefined would coerce to
  // the string "undefined" on process.env, which is a present value.
  Reflect.deleteProperty(process.env, 'SUPABASE_ANON_KEY')
  Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) Reflect.deleteProperty(process.env, k)
    else process.env[k] = v
  }
})

describe('getAnonKey', () => {
  it('prefers SUPABASE_ANON_KEY over the NEXT_PUBLIC_ variant', () => {
    process.env.SUPABASE_ANON_KEY = 'rotated-key'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stale-inlined-key'
    expect(getAnonKey()).toBe('rotated-key')
  })

  it('falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'inlined-key'
    expect(getAnonKey()).toBe('inlined-key')
  })

  // An empty string in the env means "not set", not "the key is empty".
  // ?? instead of || here would hand PostgREST an empty apikey header.
  it('treats an empty override as absent', () => {
    process.env.SUPABASE_ANON_KEY = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'inlined-key'
    expect(getAnonKey()).toBe('inlined-key')
  })

  it('answers undefined when neither is set, never an empty string', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
    expect(getAnonKey()).toBeUndefined()
  })
})

describe('requireAnonKey', () => {
  it('names both variables when nothing is set', () => {
    expect(() => requireAnonKey()).toThrow(/SUPABASE_ANON_KEY/)
    expect(() => requireAnonKey()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('returns the resolved key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'inlined-key'
    expect(requireAnonKey()).toBe('inlined-key')
  })
})
