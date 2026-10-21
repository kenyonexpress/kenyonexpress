import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/**
 * SEEDS A CHECKOUT PHONE CODE THE SERVER WILL ACCEPT, for the one gate a
 * browser test cannot pass on its own.
 *
 * After five paid physical orders (F42, src/lib/checkout/verified-shipping.ts)
 * the address step demands a six-digit code delivered over WhatsApp, or by
 * email when WhatsApp is off, and the fixture customer passed that threshold
 * long ago. Only an HMAC of the code is stored, so nothing can read it back,
 * and no test inbox exists. What a test CAN do is what `pnpm seed:test` does
 * for every other fixture: write the row itself with the service key, hashed
 * exactly as `src/server/auth/wa-otp.ts` hashes it, and then type the code it
 * chose. The server's verify path runs unchanged: newest live row for this
 * user and phone, HMAC compared, consumed once.
 *
 * THE DERIVATION IS MIRRORED, NOT IMPORTED. `wa-otp.ts` is `server-only` and
 * cannot be loaded in the Playwright process. `src/__tests__/e2e-otp-seed-
 * mirror.test.ts` pins the two copies to the same key tag and message shape,
 * so a change to one fails a unit test instead of silently failing this.
 *
 * Credentials come from the process environment first and `.env.local` second,
 * which is the precedence `next start` gives them, so the key derived here is
 * the key the server under test derives.
 */
const OTP_KEY_TAG = 'ke-wa-otp-v1'

function loadEnv(): Record<string, string | undefined> {
  const fromFile: Record<string, string> = {}
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1 || line.trimStart().startsWith('#')) continue
      let value = line.slice(eq + 1).trim()
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1)
      fromFile[line.slice(0, eq).trim()] = value
    }
  } catch {
    // No .env.local: the environment has to carry the values.
  }
  return { ...fromFile, ...process.env }
}

function hashOtp(phoneE164: string, code: string, env: Record<string, string | undefined>): string {
  const base =
    env.PASSKEY_CHALLENGE_SECRET ?? env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const key = createHmac('sha256', base).update(OTP_KEY_TAG).digest()
  return createHmac('sha256', key).update(`${phoneE164}|${code}`).digest('hex')
}

/**
 * Inserts a live code row for the fixture user and phone. Returns false, with
 * nothing written, when the service key is not available to the test process,
 * so the caller can skip with a reason rather than fail on a guess.
 */
export async function seedCheckoutPhoneOtp(
  email: string,
  phoneE164: string,
  code: string,
): Promise<boolean> {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`otp-seed listUsers: ${error.message}`)
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`otp-seed: no auth user for ${email}`)

  const { error: insertError } = await admin.from('auth_wa_otps' as never).insert({
    phone_e164: phoneE164,
    user_id: user.id,
    code_hash: hashOtp(phoneE164, code, env),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  } as never)
  if (insertError) throw new Error(`otp-seed insert: ${insertError.message}`)
  return true
}
