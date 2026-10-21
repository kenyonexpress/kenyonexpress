import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * e2e/otp-seed.ts re-derives the checkout OTP hash because
 * src/server/auth/wa-otp.ts is `server-only` and cannot be imported by
 * Playwright. Two copies of a derivation drift; this keeps them on the same
 * key tag, the same message shape and the same secret precedence, so a change
 * to the server copy fails here instead of in a money spec forty minutes into
 * a run.
 */
describe('e2e/otp-seed.ts mirrors src/server/auth/wa-otp.ts', () => {
  const server = readFileSync(resolve(process.cwd(), 'src/server/auth/wa-otp.ts'), 'utf8')
  const seed = readFileSync(resolve(process.cwd(), 'e2e/otp-seed.ts'), 'utf8')

  it('derives the key from the same tag', () => {
    expect(server).toContain("update('ke-wa-otp-v1')")
    expect(seed).toContain("const OTP_KEY_TAG = 'ke-wa-otp-v1'")
  })

  it('hashes the same phone|code message', () => {
    const message = '`${phoneE164}|${code}`'
    expect(server).toContain(message)
    expect(seed).toContain(message)
  })

  it('reads the secrets in the same order', () => {
    const order =
      'env.PASSKEY_CHALLENGE_SECRET ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY'
    expect(server).toContain(order)
    expect(seed).toContain(order)
  })
})
