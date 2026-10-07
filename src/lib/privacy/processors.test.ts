import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROCESSORS, pendingAgreements, processorById } from './processors'

/**
 * The register is only worth having if it matches the code. Two directions:
 * every row names an env key the code really reads (a vendor that was
 * removed must leave the policy too), and every vendor key the code reads
 * has a row (a vendor added to the code without a row is the policy lying).
 */

const SRC = join(process.cwd(), 'src')

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') yield* sourceFiles(path)
    } else if (/\.(ts|tsx|mjs)$/.test(entry) && !/\.test\.(ts|tsx|mjs)$/.test(entry)) {
      yield path
    }
  }
}

const corpus = [...sourceFiles(SRC)]
  .filter((path) => !path.includes('/lib/privacy/'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

/** Env keys that enable a vendor call. Add one here when a vendor is added. */
const VENDOR_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'CARDCOM_TERMINAL_NUMBER',
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'SENTRY_DSN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_GA4_MEASUREMENT_ID',
  'NEXT_PUBLIC_META_PIXEL_ID',
]

describe('the processor register', () => {
  it('has a unique id per row and a complete agreement line', () => {
    const ids = PROCESSORS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PROCESSORS) {
      expect(p.agreement.note.length, `${p.id} agreement note`).toBeGreaterThan(20)
      if (p.agreement.binding !== 'contract') {
        expect(p.agreement.url, `${p.id} needs a DPA URL`).toMatch(/^https:\/\//)
      }
    }
  })

  it('names only vendors the code can actually call', () => {
    for (const p of PROCESSORS) {
      if (p.enabledBy === null || p.enabledBy === 'VERCEL') continue
      expect(corpus.includes(p.enabledBy), `${p.id}: ${p.enabledBy} is read nowhere in src/`).toBe(
        true,
      )
    }
  })

  it('has a row for every vendor key the code reads', () => {
    const registered = new Set(PROCESSORS.map((p) => p.enabledBy))
    for (const key of VENDOR_ENV_KEYS) {
      expect(corpus.includes(key), `${key} is no longer read; drop it from the list`).toBe(true)
      expect(registered.has(key), `${key} enables a vendor with no register row`).toBe(true)
    }
  })

  it('puts the two consent-gated vendors behind the doors the code uses', () => {
    expect(processorById('posthog')?.consentCategory).toBe('analytics')
    expect(processorById('google')?.consentCategory).toBe('marketing')
    expect(processorById('meta')?.consentCategory).toBe('marketing')
    expect(processorById('supabase')?.consentCategory).toBeNull()
  })

  it('marks a signature-bound agreement pending until a human signs it', () => {
    const pending = pendingAgreements().map((p) => p.id)
    for (const p of PROCESSORS) {
      if (p.agreement.status === 'pending') expect(p.agreement.binding).toBe('signature')
    }
    expect(pending).toContain('supabase')
  })

  it('reads as Hebrew where a customer reads it', () => {
    for (const p of PROCESSORS) {
      expect(p.dataShared, `${p.id} dataShared`).toMatch(/[֐-׿]/)
      expect(p.purpose, `${p.id} purpose`).toMatch(/[֐-׿]/)
    }
  })
})
