import { PASSKEY_CHALLENGE_COOKIE, sealChallenge } from '@/lib/auth/passkeys/challenge'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The passkey ceremonies. The challenge seal (lib/auth/passkeys/challenge.ts)
 * and the WebAuthn verification (@simplewebauthn/server) are proven
 * elsewhere; what can only fail here is the plumbing: that the challenge
 * cookie is single-use and bound to the session that asked, that a credential
 * is written only through the service role and only after verification, that
 * the counter moves BEFORE a session is minted, that the login session comes
 * out of generateLink + verifyOtp, and that a missing table degrades to "not
 * available" instead of a crash.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

/** Replace whatever is queued, so the NEXT call sees exactly this result. */
function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
      delete: () => builder(name, table, 'delete'),
    }),
  }
}

// A real cookie jar: `begin` writes the sealed challenge and `finish` must
// read it back and delete it, so the two halves have to share state.
const jar = new Map<string, string>()
const cookieSet = vi.fn((name: string, value: string, _options?: unknown) => {
  jar.set(name, value)
})
const cookieDelete = vi.fn((name: string) => {
  jar.delete(name)
})
const cookieStore = {
  get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
  set: (name: string, value: string, options: unknown) => cookieSet(name, value, options),
  delete: (name: string) => cookieDelete(name),
}

const getUser = vi.fn()
const verifyOtp = vi.fn()
const requestClient = { ...fakeClient('request'), auth: { getUser, verifyOtp } }
const getUserById = vi.fn()
const generateLink = vi.fn()
const adminClient = { ...fakeClient('admin'), auth: { admin: { getUserById, generateLink } } }

const checkRateLimit = vi.fn()
const getGuestSessionId = vi.fn()
const mergeGuestCart = vi.fn()
const claimReferralOnce = vi.fn()
const redirect = vi.fn()
const logWarn = vi.fn()

const generateRegistrationOptions = vi.fn()
const generateAuthenticationOptions = vi.fn()
const verifyRegistrationResponse = vi.fn()
const verifyAuthenticationResponse = vi.fn()

const SECRET = 'test-passkey-secret'
let secret: string | null = SECRET

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/auth/passkeys/config', () => ({
  passkeyChallengeSecret: () => secret,
  passkeyRpConfig: () => ({
    rpID: 'kenyonexpress.co.il',
    rpName: 'KenyonExpress',
    origin: 'https://kenyonexpress.co.il',
  }),
}))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_session_id',
  getGuestSessionId: () => getGuestSessionId(),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimit(...a),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/server/actions/cart', () => ({
  mergeGuestCart: (...a: unknown[]) => mergeGuestCart(...a),
}))
vi.mock('@/server/referrals/claim', () => ({
  claimReferralOnce: (...a: unknown[]) => claimReferralOnce(...a),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: (...a: unknown[]) => logWarn(...a), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('next/navigation', () => ({ redirect: (target: string) => redirect(target) }))
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: (...a: unknown[]) => generateRegistrationOptions(...a),
  generateAuthenticationOptions: (...a: unknown[]) => generateAuthenticationOptions(...a),
  verifyRegistrationResponse: (...a: unknown[]) => verifyRegistrationResponse(...a),
  verifyAuthenticationResponse: (...a: unknown[]) => verifyAuthenticationResponse(...a),
}))

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CRED = 'cred-abc'
const TABLE = 'webauthn_credentials'
const MISSING_RELATION = {
  code: '42P01',
  message: 'relation "webauthn_credentials" does not exist',
}
const NOT_AVAILABLE = 'כניסה עם טביעת אצבע או Face ID עדיין לא זמינה, נסו דרך אחרת'
const TRY_AGAIN = 'אימות המפתח נכשל, נסו שוב'

const {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  beginPasskeyLogin,
  finishPasskeyLogin,
  listPasskeys,
  deletePasskey,
} = await import('./passkeys')

const find = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)

function seal(type: 'registration' | 'authentication', userId: string | null, ttl = 60_000) {
  jar.set(
    PASSKEY_CHALLENGE_COOKIE,
    sealChallenge({ challenge: 'chal-1', type, userId, expiresAt: Date.now() + ttl }, SECRET),
  )
}

const registrationResponse = { id: CRED, rawId: CRED, response: {}, type: 'public-key' } as never
const authenticationResponse = { id: CRED, rawId: CRED, response: {}, type: 'public-key' } as never

const STORED_ROW = {
  id: CRED,
  user_id: USER,
  public_key: Buffer.from('pk').toString('base64url'),
  counter: 4,
  transports: ['internal'],
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  jar.clear()
  secret = SECRET
  cookieSet.mockClear()
  cookieDelete.mockClear()
  logWarn.mockReset()
  redirect.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER, email: 'u@example.com' } } })
  verifyOtp.mockReset()
  verifyOtp.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  getUserById.mockReset()
  getUserById.mockResolvedValue({
    data: { user: { id: USER, email: 'u@example.com' } },
    error: null,
  })
  generateLink.mockReset()
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed-1' } },
    error: null,
  })
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  getGuestSessionId.mockReset()
  getGuestSessionId.mockResolvedValue(null)
  mergeGuestCart.mockReset()
  mergeGuestCart.mockResolvedValue(true)
  claimReferralOnce.mockReset()
  claimReferralOnce.mockResolvedValue(undefined)
  generateRegistrationOptions.mockReset()
  generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-chal', rp: { id: 'x' } })
  generateAuthenticationOptions.mockReset()
  generateAuthenticationOptions.mockResolvedValue({ challenge: 'auth-chal' })
  verifyRegistrationResponse.mockReset()
  verifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: CRED,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 0,
        transports: ['internal'],
      },
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
      aaguid: 'aaguid-1',
    },
  })
  verifyAuthenticationResponse.mockReset()
  verifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 5 },
  })
  queue(`admin:${TABLE}.select`, { data: [STORED_ROW], error: null })
})

describe('beginPasskeyRegistration', () => {
  it('excludes the credentials already on the account and seals a bound challenge', async () => {
    override(`admin:${TABLE}.select`, {
      data: [{ id: 'old-cred', transports: ['usb'] }],
      error: null,
    })
    const result = await beginPasskeyRegistration()
    expect(result).toEqual({ options: { challenge: 'reg-chal', rp: { id: 'x' } } })

    expect(checkRateLimit).toHaveBeenCalledWith('passkey-register:203.0.113.9', 10, 3600)
    const [read] = find(`admin:${TABLE}`, 'select')
    expect(read?.chain).toEqual([['eq', ['user_id', USER]]])

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'kenyonexpress.co.il',
        userName: 'u@example.com',
        challenge: expect.any(String),
        attestationType: 'none',
        excludeCredentials: [{ id: 'old-cred', transports: ['usb'] }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }),
    )
    expect(new TextDecoder().decode(generateRegistrationOptions.mock.calls[0]?.[0].userID)).toBe(
      USER,
    )

    // The cookie carries the OPTIONS' challenge, sealed to this user.
    expect(cookieSet).toHaveBeenCalledWith(
      PASSKEY_CHALLENGE_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 300 }),
    )
    const { openChallenge } = await import('@/lib/auth/passkeys/challenge')
    expect(openChallenge(jar.get(PASSKEY_CHALLENGE_COOKIE) as string, SECRET)).toMatchObject({
      challenge: 'reg-chal',
      type: 'registration',
      userId: USER,
    })
  })

  it('falls back to phone then id for the user name', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER, email: null, phone: '972501234567' } } })
    await beginPasskeyRegistration()
    expect(generateRegistrationOptions.mock.calls[0]?.[0].userName).toBe('972501234567')
    getUser.mockResolvedValue({ data: { user: { id: USER, email: null, phone: null } } })
    await beginPasskeyRegistration()
    expect(generateRegistrationOptions.mock.calls[1]?.[0].userName).toBe(USER)
  })

  it('refuses without a secret, a session, or under the rate limit, before any read', async () => {
    secret = null
    expect(await beginPasskeyRegistration()).toEqual({ error: NOT_AVAILABLE })
    secret = SECRET
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await beginPasskeyRegistration()).toEqual({ error: 'יש להתחבר תחילה' })
    checkRateLimit.mockResolvedValueOnce(false)
    expect(await beginPasskeyRegistration()).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(calls).toEqual([])
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('degrades to "not available" when the table is unmigrated, and logs other read failures', async () => {
    override(`admin:${TABLE}.select`, { data: null, error: MISSING_RELATION })
    expect(await beginPasskeyRegistration()).toEqual({ error: NOT_AVAILABLE })
    override(`admin:${TABLE}.select`, { data: null, error: { message: 'timeout' } })
    expect(await beginPasskeyRegistration()).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenCalledWith('passkey.register_begin_failed', { reason: 'timeout' })
    expect(cookieSet).not.toHaveBeenCalled()
  })
})

describe('finishPasskeyRegistration', () => {
  it('verifies against the sealed challenge, consumes the cookie, and stores via the service role', async () => {
    seal('registration', USER)
    const result = await finishPasskeyRegistration(registrationResponse, '  המכשיר שלי  ')
    expect(result).toEqual({
      success: 'המפתח נשמר, מעכשיו אפשר להתחבר עם טביעת אצבע או Face ID',
    })

    expect(cookieDelete).toHaveBeenCalledWith(PASSKEY_CHALLENGE_COOKIE)
    expect(verifyRegistrationResponse).toHaveBeenCalledWith({
      response: registrationResponse,
      expectedChallenge: 'chal-1',
      expectedOrigin: 'https://kenyonexpress.co.il',
      expectedRPID: 'kenyonexpress.co.il',
      requireUserVerification: true,
    })

    const [insert] = find(`admin:${TABLE}`, 'insert')
    expect(insert?.payload).toEqual({
      id: CRED,
      user_id: USER,
      public_key: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 0,
      transports: ['internal'],
      device_type: 'multiDevice',
      backed_up: true,
      aaguid: 'aaguid-1',
      friendly_name: 'המכשיר שלי',
    })
    expect(find(`request:${TABLE}`, 'insert')).toEqual([])
  })

  it('stores a null name for a blank one and an empty transports list when absent', async () => {
    seal('registration', USER)
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: CRED, publicKey: new Uint8Array([9]), counter: 2 },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        aaguid: null,
      },
    })
    await finishPasskeyRegistration(registrationResponse, '   ')
    expect(find(`admin:${TABLE}`, 'insert')[0]?.payload).toMatchObject({
      friendly_name: null,
      transports: [],
      counter: 2,
    })
  })

  it('refuses a missing, expired, wrong-type or other-session challenge, without verifying', async () => {
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.register_challenge_invalid', {
      reason: 'missing/expired',
    })

    seal('registration', USER, -1)
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })

    seal('authentication', null)
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.register_challenge_invalid', {
      reason: 'user mismatch',
    })

    seal('registration', OTHER)
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })

    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    // Every attempt consumed its cookie.
    expect(jar.has(PASSKEY_CHALLENGE_COOKIE)).toBe(false)
  })

  it('refuses without a secret or a session', async () => {
    secret = null
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: NOT_AVAILABLE })
    secret = SECRET
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({
      error: 'יש להתחבר תחילה',
    })
  })

  it('stores nothing when verification throws or comes back unverified', async () => {
    seal('registration', USER)
    verifyRegistrationResponse.mockRejectedValueOnce(new Error('bad origin'))
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.register_verify_failed', {
      reason: 'bad origin',
    })

    seal('registration', USER)
    verifyRegistrationResponse.mockRejectedValueOnce('string cause')
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.register_verify_failed', {
      reason: 'string cause',
    })

    seal('registration', USER)
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: false })
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(calls).toEqual([])
  })

  it('degrades on an unmigrated table and reports other store failures', async () => {
    seal('registration', USER)
    override(`admin:${TABLE}.insert`, { data: null, error: MISSING_RELATION })
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: NOT_AVAILABLE })

    seal('registration', USER)
    override(`admin:${TABLE}.insert`, { data: null, error: { code: '23505', message: 'dup' } })
    expect(await finishPasskeyRegistration(registrationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.register_store_failed', { reason: 'dup' })
  })
})

describe('beginPasskeyLogin', () => {
  it('issues usernameless options and seals an unbound authentication challenge', async () => {
    const result = await beginPasskeyLogin()
    expect(result).toEqual({ options: { challenge: 'auth-chal' } })
    expect(checkRateLimit).toHaveBeenCalledWith('passkey-login:203.0.113.9', 30, 3600)
    expect(generateAuthenticationOptions).toHaveBeenCalledWith({
      rpID: 'kenyonexpress.co.il',
      allowCredentials: [],
      userVerification: 'required',
    })
    const { openChallenge } = await import('@/lib/auth/passkeys/challenge')
    expect(openChallenge(jar.get(PASSKEY_CHALLENGE_COOKIE) as string, SECRET)).toMatchObject({
      challenge: 'auth-chal',
      type: 'authentication',
      userId: null,
    })
  })

  it('refuses without a secret or under the rate limit', async () => {
    secret = null
    expect(await beginPasskeyLogin()).toEqual({ error: NOT_AVAILABLE })
    secret = SECRET
    checkRateLimit.mockResolvedValueOnce(false)
    expect(await beginPasskeyLogin()).toEqual({ error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה' })
    expect(generateAuthenticationOptions).not.toHaveBeenCalled()
  })
})

describe('finishPasskeyLogin', () => {
  it('verifies, advances the counter, mints a session through generateLink + verifyOtp, redirects', async () => {
    seal('authentication', null)
    await finishPasskeyLogin(authenticationResponse, '/account')

    expect(checkRateLimit).toHaveBeenCalledWith('passkey-login-finish:203.0.113.9', 20, 3600)
    const [lookup] = find(`admin:${TABLE}`, 'select')
    expect(lookup?.chain).toEqual([
      ['eq', ['id', CRED]],
      ['limit', [1]],
    ])

    expect(verifyAuthenticationResponse).toHaveBeenCalledWith({
      response: authenticationResponse,
      expectedChallenge: 'chal-1',
      expectedOrigin: 'https://kenyonexpress.co.il',
      expectedRPID: 'kenyonexpress.co.il',
      requireUserVerification: true,
      credential: {
        id: CRED,
        publicKey: new Uint8Array(Buffer.from('pk')),
        counter: 4,
        transports: ['internal'],
      },
    })

    const [counter] = find(`admin:${TABLE}`, 'update')
    expect(counter?.payload).toMatchObject({ counter: 5 })
    expect((counter?.payload as { last_used_at: string }).last_used_at).toMatch(/^\d{4}-/)
    expect(counter?.chain).toEqual([['eq', ['id', CRED]]])

    expect(getUserById).toHaveBeenCalledWith(USER)
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'u@example.com' })
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hashed-1' })
    // No guest cookie, so no merge, but the referral claim still runs.
    expect(mergeGuestCart).not.toHaveBeenCalled()
    expect(claimReferralOnce).toHaveBeenCalledWith(USER, null)
    expect(redirect).toHaveBeenCalledWith('/account')
  })

  it('merges the guest cart and clears its cookie only when the merge ran', async () => {
    seal('authentication', null)
    getGuestSessionId.mockResolvedValue('guest-1')
    await finishPasskeyLogin(authenticationResponse, 'https://evil.example/')
    expect(mergeGuestCart).toHaveBeenCalledWith(requestClient, USER, 'guest-1')
    expect(cookieDelete).toHaveBeenCalledWith('ke_session_id')
    expect(claimReferralOnce).toHaveBeenCalledWith(USER, 'guest-1')
    expect(redirect).toHaveBeenCalledWith('/')

    cookieDelete.mockClear()
    seal('authentication', null)
    mergeGuestCart.mockResolvedValue(false)
    await finishPasskeyLogin(authenticationResponse)
    expect(cookieDelete).not.toHaveBeenCalledWith('ke_session_id')
  })

  it('refuses without a secret, under the limit, without a challenge, or with a bad response', async () => {
    secret = null
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: NOT_AVAILABLE })
    secret = SECRET
    checkRateLimit.mockResolvedValueOnce(false)
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({
      error: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
    })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_challenge_invalid', {
      reason: 'missing/expired',
    })
    // A registration challenge cannot authorise a login.
    seal('registration', USER)
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })

    seal('authentication', null)
    expect(await finishPasskeyLogin({ id: '' } as never)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_bad_response', {
      reason: 'no credential id',
    })
    expect(calls).toEqual([])
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('says the same sentence for an unknown credential as for a failed verification', async () => {
    seal('authentication', null)
    override(`admin:${TABLE}.select`, { data: [], error: null })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_unknown_credential', { reason: CRED })
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
  })

  it('degrades on an unmigrated table and reports other lookup failures', async () => {
    seal('authentication', null)
    override(`admin:${TABLE}.select`, { data: null, error: { code: 'PGRST205', message: 'cache' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: NOT_AVAILABLE })
    seal('authentication', null)
    override(`admin:${TABLE}.select`, { data: null, error: { message: 'timeout' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_lookup_failed', { reason: 'timeout' })
  })

  it('mints no session when verification throws or fails, and none when the counter write fails', async () => {
    seal('authentication', null)
    verifyAuthenticationResponse.mockRejectedValueOnce(new Error('signature'))
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_verify_failed', {
      reason: 'signature',
    })

    seal('authentication', null)
    verifyAuthenticationResponse.mockRejectedValueOnce(42)
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_verify_failed', { reason: '42' })

    seal('authentication', null)
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(find(`admin:${TABLE}`, 'update')).toEqual([])

    seal('authentication', null)
    override(`admin:${TABLE}.update`, { data: null, error: { message: 'locked' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_counter_failed', { reason: 'locked' })

    expect(generateLink).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('stops when the owner cannot be read, has no email, or the link/session fails', async () => {
    seal('authentication', null)
    getUserById.mockResolvedValueOnce({ data: null, error: { message: 'gone' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_user_missing', { reason: 'gone' })

    seal('authentication', null)
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_user_missing', { reason: USER })

    seal('authentication', null)
    getUserById.mockResolvedValueOnce({ data: { user: { id: USER, email: null } }, error: null })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({
      error: 'לחשבון הזה אין אימייל, התחברו עם קוד ב-SMS',
    })
    expect(generateLink).not.toHaveBeenCalled()

    seal('authentication', null)
    generateLink.mockResolvedValueOnce({ data: null, error: { message: 'no link' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_link_failed', { reason: 'no link' })

    seal('authentication', null)
    generateLink.mockResolvedValueOnce({ data: { properties: {} }, error: null })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_link_failed', {
      reason: 'no hashed_token',
    })
    expect(verifyOtp).not.toHaveBeenCalled()

    seal('authentication', null)
    verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { message: 'otp' } })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_session_failed', { reason: 'otp' })

    seal('authentication', null)
    verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect(await finishPasskeyLogin(authenticationResponse)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.login_session_failed', {
      reason: 'no user',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('listPasskeys', () => {
  it('reads the caller’s own rows through the request client, newest first', async () => {
    const rows = [{ id: CRED, friendly_name: null, device_type: 'multiDevice' }]
    override(`request:${TABLE}.select`, { data: rows, error: null })
    expect(await listPasskeys()).toEqual({ available: true, passkeys: rows })
    const [read] = find(`request:${TABLE}`, 'select')
    expect(read?.chain).toEqual([
      ['eq', ['user_id', USER]],
      ['order', ['created_at', { ascending: false }]],
    ])
    expect(calls.some((c) => c.table.startsWith('admin:'))).toBe(false)
  })

  it('reports an empty list as available, an unmigrated table as unavailable', async () => {
    override(`request:${TABLE}.select`, { data: null, error: null })
    expect(await listPasskeys()).toEqual({ available: true, passkeys: [] })
    override(`request:${TABLE}.select`, { data: null, error: MISSING_RELATION })
    expect(await listPasskeys()).toEqual({ available: false })
    override(`request:${TABLE}.select`, { data: null, error: { message: 'timeout' } })
    expect(await listPasskeys()).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.list_failed', { reason: 'timeout' })
  })

  it('refuses without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await listPasskeys()).toEqual({ error: 'יש להתחבר תחילה' })
    expect(calls).toEqual([])
  })
})

describe('deletePasskey', () => {
  it('deletes by id AND owner through the request client', async () => {
    expect(await deletePasskey(CRED)).toEqual({ success: 'המפתח הוסר' })
    const [del] = find(`request:${TABLE}`, 'delete')
    expect(del?.chain).toEqual([
      ['eq', ['id', CRED]],
      ['eq', ['user_id', USER]],
    ])
  })

  it('refuses a non-string or empty id and an anonymous caller before any write', async () => {
    expect(await deletePasskey(42)).toEqual({ error: 'מפתח לא תקין' })
    expect(await deletePasskey('')).toEqual({ error: 'מפתח לא תקין' })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await deletePasskey(CRED)).toEqual({ error: 'יש להתחבר תחילה' })
    expect(calls).toEqual([])
  })

  it('degrades on an unmigrated table and reports other failures', async () => {
    override(`request:${TABLE}.delete`, { data: null, error: MISSING_RELATION })
    expect(await deletePasskey(CRED)).toEqual({ error: NOT_AVAILABLE })
    override(`request:${TABLE}.delete`, { data: null, error: { message: 'rls' } })
    expect(await deletePasskey(CRED)).toEqual({ error: TRY_AGAIN })
    expect(logWarn).toHaveBeenLastCalledWith('passkey.delete_failed', { reason: 'rls' })
  })
})
