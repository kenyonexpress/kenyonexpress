import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The sign-in, sign-up and recovery actions. The schemas, the phone-merge
 * decision and the error map's shape are proven in their own modules
 * (auth-error-map.test.ts, lib/auth/phone-merge.test.ts); verifyEmailOtp and
 * changePassword are in auth-email-otp.test.ts. What can only fail here is
 * the plumbing: which GoTrue call is made with what, that every ceiling is
 * checked BEFORE GoTrue is asked, that the guest cart merge gates the cookie
 * delete, that the phone attach runs through the service role before the SMS,
 * and that the reset endpoint never reveals whether an address exists.
 */

type Result = { data: unknown; error?: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
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
      upsert: (payload: unknown, options?: unknown) =>
        builder(name, table, 'upsert', { payload, options }),
    }),
  }
}

const signInWithOAuth = vi.fn()
const signInWithPassword = vi.fn()
const signUp = vi.fn()
const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()
const sessionSignOut = vi.fn()
const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()
const requestClient = {
  ...fakeClient('request'),
  auth: {
    signInWithOAuth,
    signInWithPassword,
    signUp,
    signInWithOtp,
    verifyOtp,
    signOut: sessionSignOut,
    resetPasswordForEmail,
    updateUser,
  },
}
const getUserById = vi.fn()
const updateUserById = vi.fn()
const adminClient = { ...fakeClient('admin'), auth: { admin: { getUserById, updateUserById } } }

/** Keys whose prefix is listed here are refused; everything else passes. */
const denied = new Set<string>()
const checkRateLimit = vi.fn(
  async (key: string, _limit?: number, _windowMs?: number) =>
    ![...denied].some((prefix) => key.startsWith(prefix)),
)
const getGuestSessionId = vi.fn()
const mergeGuestCart = vi.fn()
const claimReferralOnce = vi.fn()
const trySendBrandedMagicLink = vi.fn()
const trySendBrandedPasswordReset = vi.fn()
const redirect = vi.fn()
const cookieDelete = vi.fn()
const logWarn = vi.fn()
const logError = vi.fn()
const logInfo = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
const issueSignupPhoneOtp = vi.fn()
vi.mock('@/server/auth/signup-phone-otp', () => ({
  issueSignupPhoneOtp: (...a: unknown[]) => issueSignupPhoneOtp(...a),
}))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => ({ auth: { signInWithPassword: vi.fn(), signOut: vi.fn() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...a: [string, number?, number?]) => checkRateLimit(...a),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/cart/guest-session', () => ({
  GUEST_SESSION_COOKIE: 'ke_session_id',
  getGuestSessionId: () => getGuestSessionId(),
}))
vi.mock('@/server/actions/cart', () => ({
  mergeGuestCart: (...a: unknown[]) => mergeGuestCart(...a),
}))
vi.mock('@/server/referrals/claim', () => ({
  claimReferralOnce: (...a: unknown[]) => claimReferralOnce(...a),
}))
vi.mock('@/server/auth/password-reset-send', () => ({
  trySendBrandedPasswordReset: (...a: unknown[]) => trySendBrandedPasswordReset(...a),
}))
vi.mock('@/server/auth/magic-link-send', () => ({
  trySendBrandedMagicLink: (...a: unknown[]) => trySendBrandedMagicLink(...a),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...a: unknown[]) => logError(...a),
    warn: (...a: unknown[]) => logWarn(...a),
    info: (...a: unknown[]) => logInfo(...a),
    debug: vi.fn(),
  },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: cookieDelete }) }))
vi.mock('next/navigation', () => ({ redirect: (target: string) => redirect(target) }))

const USER = '11111111-1111-4111-8111-111111111111'
const GUEST = '22222222-2222-4222-8222-222222222222'
const E164 = '+972501234567'
const TOO_MANY = 'יותר מדי ניסיונות — נסו שוב בעוד שעה'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  sendMagicLink,
  sendPhoneOtp,
  verifyPhoneOtp,
  signOut,
  signOutAll,
  sendPasswordReset,
  updatePassword,
} = await import('./auth')

const find = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  denied.clear()
  process.env.NEXT_PUBLIC_APP_URL = 'https://kenyonexpress.co.il'
  process.env.PHONE_AUTH_ENABLED = 'true'
  for (const fn of [
    signInWithOAuth,
    signInWithPassword,
    signUp,
    signInWithOtp,
    verifyOtp,
    sessionSignOut,
    resetPasswordForEmail,
    updateUser,
    getUserById,
    updateUserById,
    getGuestSessionId,
    mergeGuestCart,
    claimReferralOnce,
    trySendBrandedMagicLink,
    redirect,
    cookieDelete,
    logWarn,
    logError,
    logInfo,
    issueSignupPhoneOtp,
  ]) {
    fn.mockReset()
  }
  checkRateLimit.mockClear()
  signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o' }, error: null })
  signInWithPassword.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  signUp.mockResolvedValue({ data: {}, error: null })
  signInWithOtp.mockResolvedValue({ data: {}, error: null })
  verifyOtp.mockResolvedValue({ data: { user: { id: USER } }, error: null })
  sessionSignOut.mockResolvedValue({ error: null })
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  updateUser.mockResolvedValue({ data: {}, error: null })
  getUserById.mockResolvedValue({ data: { user: { id: USER, phone: null } }, error: null })
  updateUserById.mockResolvedValue({ data: {}, error: null })
  getGuestSessionId.mockResolvedValue(null)
  mergeGuestCart.mockResolvedValue(true)
  claimReferralOnce.mockResolvedValue(undefined)
  trySendBrandedMagicLink.mockResolvedValue(false)
  trySendBrandedPasswordReset.mockResolvedValue(false)
})

describe('signInWithGoogle', () => {
  it('sends the customer to Google with a same-site callback, then follows the URL', async () => {
    const result = await signInWithGoogle(null, form({ next: '/cart' }))
    expect(result).toBeNull()
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://kenyonexpress.co.il/auth/callback?next=%2Fcart',
        scopes: 'openid email profile',
      },
    })
    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/o')
  })

  it('never carries an off-site next, and maps a provider error to Hebrew', async () => {
    await signInWithGoogle(null, form({ next: 'https://evil.example/' }))
    expect(signInWithOAuth.mock.calls[0]?.[0].options.redirectTo).toBe(
      'https://kenyonexpress.co.il/auth/callback?next=%2F',
    )
    signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'Too many requests' } })
    expect(await signInWithGoogle(null, form({}))).toEqual({
      error: 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
    })
  })

  it('returns null without redirecting when the provider gives no URL', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null })
    expect(await signInWithGoogle(null, form({}))).toBeNull()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('signInWithEmail', () => {
  const VALID = { email: 'U@Example.com', password: 'secret' }

  it('signs in, merges the guest cart, clears its cookie, and redirects to next', async () => {
    getGuestSessionId.mockResolvedValue(GUEST)
    await signInWithEmail(null, form({ ...VALID, next: '/account' }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'U@Example.com', password: 'secret' })
    expect(mergeGuestCart).toHaveBeenCalledWith(requestClient, USER, GUEST)
    expect(cookieDelete).toHaveBeenCalledWith('ke_session_id')
    expect(redirect).toHaveBeenCalledWith('/account')
  })

  it('is ceilinged per IP and per lower-cased account, before GoTrue is asked', async () => {
    await signInWithEmail(null, form(VALID))
    expect(checkRateLimit).toHaveBeenCalledWith('login:203.0.113.9')
    expect(checkRateLimit).toHaveBeenCalledWith('login-account:u@example.com', 20, 3600)

    signInWithPassword.mockClear()
    denied.add('login:')
    expect(await signInWithEmail(null, form(VALID))).toEqual({
      error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה',
    })
    denied.clear()
    denied.add('login-account:')
    // The same sentence: a different one would confirm the address exists.
    expect(await signInWithEmail(null, form(VALID))).toEqual({
      error: 'יותר מדי ניסיונות כניסה — נסו שוב בעוד שעה',
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('refuses a malformed form and maps the credential failure', async () => {
    expect(await signInWithEmail(null, form({ email: 'nope', password: 'x' }))).toEqual({
      error: 'כתובת אימייל לא תקינה',
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    })
    expect(await signInWithEmail(null, form(VALID))).toEqual({
      error: 'כתובת אימייל או סיסמה שגויים',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('keeps the guest cookie when the merge did not run, and skips it with no guest', async () => {
    getGuestSessionId.mockResolvedValue(GUEST)
    mergeGuestCart.mockResolvedValue(false)
    await signInWithEmail(null, form(VALID))
    expect(cookieDelete).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/')

    mergeGuestCart.mockClear()
    getGuestSessionId.mockResolvedValue(null)
    await signInWithEmail(null, form(VALID))
    expect(mergeGuestCart).not.toHaveBeenCalled()
  })

  it('logs an unmapped provider message and shows the generic sentence', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Something new from upstream' },
    })
    expect(await signInWithEmail(null, form(VALID))).toEqual({ error: 'אירעה שגיאה, נסו שוב' })
    expect(logWarn).toHaveBeenCalledWith('auth.error_unmapped', {
      reason: 'Something new from upstream',
    })
  })
})

describe('signUpWithEmail', () => {
  const VALID = {
    full_name: ' דנה כהן ',
    email: 'Dana@Example.com',
    phone: '050-123-4567',
    password: 'secret12',
  }

  it('creates the account with trimmed name and normalised contact, then confirms', async () => {
    await signUpWithEmail(null, form(VALID))
    expect(checkRateLimit).toHaveBeenCalledWith('signup:203.0.113.9', 5, 3600)
    expect(signUp).toHaveBeenCalledWith({
      email: 'dana@example.com',
      password: 'secret12',
      options: { data: { full_name: 'דנה כהן', phone: '0501234567' } },
    })
    expect(redirect).toHaveBeenCalledWith('/signup/confirm')
  })

  it('refuses under the ceiling, on a bad form, and maps a duplicate address', async () => {
    denied.add('signup:')
    expect(await signUpWithEmail(null, form(VALID))).toEqual({
      error: 'יותר מדי ניסיונות הרשמה — נסו שוב בעוד שעה',
    })
    denied.clear()
    expect(await signUpWithEmail(null, form({ ...VALID, password: 'short' }))).toEqual({
      error: 'הסיסמה חייבת להכיל לפחות 8 תווים',
    })
    expect(signUp).not.toHaveBeenCalled()
    signUp.mockResolvedValue({ data: {}, error: { message: 'User already registered' } })
    expect(await signUpWithEmail(null, form(VALID))).toEqual({
      error: 'כתובת האימייל כבר רשומה במערכת',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  // STEP 18: the phone typed into the form is challenged by SMS before the
  // email step, for a user that was actually created.
  const CREATED = { id: '11111111-1111-4111-8111-111111111111', identities: [{ id: 'i-1' }] }

  it('texts the code to the new user and lands on the code screen, carrying next', async () => {
    signUp.mockResolvedValue({ data: { user: CREATED }, error: null })
    issueSignupPhoneOtp.mockResolvedValue({
      ok: true,
      to: '+972501234567',
      expiresAt: 'x',
      segments: 1,
    })
    await signUpWithEmail(null, form({ ...VALID, next: '/checkout' }))
    expect(issueSignupPhoneOtp).toHaveBeenCalledWith({ e164: '+972501234567', userId: CREATED.id })
    expect(redirect).toHaveBeenCalledWith(
      '/signup/verify-phone?phone=%2B972501234567&next=%2Fcheckout',
    )
  })

  it('skips to the email step when the code cannot be sent, and keeps next', async () => {
    signUp.mockResolvedValue({ data: { user: CREATED }, error: null })
    issueSignupPhoneOtp.mockResolvedValue({ ok: false, reason: 'sms_unavailable' })
    await signUpWithEmail(null, form({ ...VALID, next: '/checkout' }))
    expect(redirect).toHaveBeenCalledWith('/signup/confirm?next=%2Fcheckout')
  })

  it('never texts for the placeholder user GoTrue answers a duplicate address with', async () => {
    signUp.mockResolvedValue({ data: { user: { ...CREATED, identities: [] } }, error: null })
    await signUpWithEmail(null, form(VALID))
    expect(issueSignupPhoneOtp).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/signup/confirm')
  })
})

describe('sendMagicLink', () => {
  it('prefers the branded mail and does not touch GoTrue when it was sent', async () => {
    trySendBrandedMagicLink.mockResolvedValue(true)
    expect(await sendMagicLink(null, form({ email: 'U@Example.com' }))).toEqual({
      success: 'שלחנו קישור כניסה לאימייל שלך — בדקו את תיבת הדואר',
    })
    expect(trySendBrandedMagicLink).toHaveBeenCalledWith('u@example.com')
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('falls back to the Supabase mail with a same-site callback, same copy either way', async () => {
    expect(await sendMagicLink(null, form({ email: 'u@example.com' }))).toEqual({
      success: 'שלחנו קישור כניסה לאימייל שלך — בדקו את תיבת הדואר',
    })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'u@example.com',
      options: { emailRedirectTo: 'https://kenyonexpress.co.il/auth/callback' },
    })
  })

  it('refuses under the ceiling, on a bad address, and maps a provider error', async () => {
    denied.add('magic:')
    expect(await sendMagicLink(null, form({ email: 'u@example.com' }))).toEqual({
      error: TOO_MANY,
    })
    denied.clear()
    expect(await sendMagicLink(null, form({ email: '' }))).toEqual({ error: 'אימייל נדרש' })
    expect(trySendBrandedMagicLink).not.toHaveBeenCalled()
    signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'Email rate limit exceeded' } })
    expect(await sendMagicLink(null, form({ email: 'u@example.com' }))).toEqual({
      error: 'יותר מדי ניסיונות — נסו שוב מאוחר יותר',
    })
  })
})

describe('sendPhoneOtp', () => {
  const PHONE = { phone: '050-123-4567' }

  it('attaches the number to the one profile that carries it, then sends the SMS', async () => {
    queue('admin:profiles.select', {
      data: [
        { id: USER, phone: '+972 50 123 4567', email: 'u@example.com' },
        // Same suffix, different number: the SQL filter is wide, TS is exact.
        { id: GUEST, phone: '052-123-4567', email: 'other@example.com' },
      ],
      error: null,
    })
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ success: E164 })

    expect(checkRateLimit).toHaveBeenCalledWith('phone-otp:203.0.113.9', 5, 3600)
    expect(checkRateLimit).toHaveBeenCalledWith(`phone-otp-number:${E164}`, 5, 3600)

    const [read] = find('admin:profiles', 'select')
    expect(read?.payload).toBe('id, phone, email')
    expect(read?.chain).toEqual([
      ['ilike', ['phone', '%1234567']],
      ['limit', [50]],
    ])
    expect(getUserById).toHaveBeenCalledWith(USER)
    expect(updateUserById).toHaveBeenCalledWith(USER, { phone: E164, phone_confirm: true })
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: E164 })
  })

  it('skips the attach when the number is already on the account', async () => {
    queue('admin:profiles.select', { data: [{ id: USER, phone: '0501234567', email: null }] })
    getUserById.mockResolvedValue({ data: { user: { id: USER, phone: '972501234567' } } })
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ success: E164 })
    expect(updateUserById).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledWith('auth.phone_merge_skipped', {
      reason: 'phone already attached to an account',
    })
  })

  it('skips the attach when the number identifies no one, or more than one', async () => {
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ success: E164 })
    expect(getUserById).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenLastCalledWith('auth.phone_merge_skipped', {
      reason: 'no existing profile carries this number',
    })

    queue('admin:profiles.select', {
      data: [
        { id: USER, phone: '0501234567', email: null },
        { id: GUEST, phone: '0501234567', email: null },
      ],
    })
    await sendPhoneOtp(null, form(PHONE))
    expect(logInfo).toHaveBeenLastCalledWith('auth.phone_merge_skipped', {
      reason: 'more than one profile carries this number',
    })
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('skips the attach when the candidate account cannot be read', async () => {
    queue('admin:profiles.select', { data: [{ id: USER, phone: '0501234567', email: null }] })
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'gone' } })
    await sendPhoneOtp(null, form(PHONE))
    expect(updateUserById).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenLastCalledWith('auth.phone_merge_skipped', {
      reason: 'candidate account could not be read',
    })
  })

  it('still sends the code when the attach itself fails, and logs it', async () => {
    queue('admin:profiles.select', { data: [{ id: USER, phone: '0501234567', email: null }] })
    updateUserById.mockResolvedValue({ data: null, error: { message: 'phone taken' } })
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ success: E164 })
    expect(logError).toHaveBeenCalledWith('auth.phone_merge_failed', { reason: 'phone taken' })
    expect(signInWithOtp).toHaveBeenCalledTimes(1)
  })

  it('is off unless configured, and ceilinged per IP and per number', async () => {
    process.env.PHONE_AUTH_ENABLED = ''
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ error: 'כניסה בטלפון אינה זמינה כרגע' })
    expect(checkRateLimit).not.toHaveBeenCalled()

    process.env.PHONE_AUTH_ENABLED = '1'
    denied.add('phone-otp:')
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ error: TOO_MANY })
    denied.clear()
    denied.add('phone-otp-number:')
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({
      error: 'יותר מדי בקשות למספר הזה — נסו שוב בעוד שעה',
    })
    expect(calls).toEqual([])
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('refuses a short number and a landline before spending an SMS', async () => {
    expect(await sendPhoneOtp(null, form({ phone: '05012' }))).toEqual({
      error: 'מספר טלפון נדרש',
    })
    expect(await sendPhoneOtp(null, form({ phone: '03-1234567' }))).toEqual({
      error: 'יש להזין מספר טלפון נייד ישראלי (05X)',
    })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('maps the provider failure and logs its reason', async () => {
    signInWithOtp.mockResolvedValue({ data: {}, error: { message: 'Unsupported phone provider' } })
    expect(await sendPhoneOtp(null, form(PHONE))).toEqual({ error: 'שליחת SMS אינה זמינה כרגע' })
    expect(logError).toHaveBeenCalledWith('auth.phone_otp_send_failed', {
      reason: 'Unsupported phone provider',
    })
  })
})

describe('verifyPhoneOtp', () => {
  const VALID = { phone: '0501234567', token: ' 123456 ' }

  it('verifies the SMS code, merges the cart, writes the profile row, claims, redirects', async () => {
    getGuestSessionId.mockResolvedValue(GUEST)
    await verifyPhoneOtp(null, form({ ...VALID, next: '/orders' }))
    expect(checkRateLimit).toHaveBeenCalledWith('phone-verify:203.0.113.9', 20, 3600)
    expect(verifyOtp).toHaveBeenCalledWith({ phone: E164, token: '123456', type: 'sms' })
    expect(mergeGuestCart).toHaveBeenCalledWith(requestClient, USER, GUEST)
    expect(cookieDelete).toHaveBeenCalledWith('ke_session_id')

    const [upsert] = find('admin:profiles', 'upsert')
    expect(upsert?.payload).toEqual({
      payload: { id: USER, phone: E164 },
      options: { onConflict: 'id', ignoreDuplicates: true },
    })
    expect(claimReferralOnce).toHaveBeenCalledWith(USER, GUEST)
    expect(redirect).toHaveBeenCalledWith('/orders')
  })

  it('keeps the guest cookie when the merge did not run', async () => {
    getGuestSessionId.mockResolvedValue(GUEST)
    mergeGuestCart.mockResolvedValue(false)
    await verifyPhoneOtp(null, form(VALID))
    expect(cookieDelete).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('writes no profile and claims nothing when GoTrue returns no user', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null })
    await verifyPhoneOtp(null, form(VALID))
    expect(calls).toEqual([])
    expect(claimReferralOnce).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('is off unless configured, ceilinged, and strict about the form', async () => {
    process.env.PHONE_AUTH_ENABLED = 'false'
    expect(await verifyPhoneOtp(null, form(VALID))).toEqual({
      error: 'כניסה בטלפון אינה זמינה כרגע',
    })
    process.env.PHONE_AUTH_ENABLED = 'true'
    denied.add('phone-verify:')
    expect(await verifyPhoneOtp(null, form(VALID))).toEqual({ error: TOO_MANY })
    denied.clear()
    expect(await verifyPhoneOtp(null, form({ ...VALID, token: 'abc' }))).toEqual({
      error: 'הקוד מורכב מספרות בלבד',
    })
    expect(await verifyPhoneOtp(null, form({ ...VALID, phone: '123456789' }))).toEqual({
      error: 'מספר הטלפון אינו תקין',
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('says one thing for a wrong or expired code', async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has expired or is invalid' },
    })
    expect(await verifyPhoneOtp(null, form(VALID))).toEqual({ error: 'הקוד שגוי או שפג תוקפו' })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('signOut / signOutAll', () => {
  it('ends this device only, or every device, then goes to the login page', async () => {
    await signOut()
    expect(sessionSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(redirect).toHaveBeenCalledWith('/login')
    await signOutAll()
    expect(sessionSignOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(redirect).toHaveBeenCalledTimes(2)
  })
})

describe('sendPasswordReset', () => {
  const NEUTRAL = { success: 'שלחנו לך קישור לאיפוס הסיסמה — בדקו את תיבת הדואר' }

  it('sends the branded mail first and never asks GoTrue when it went out', async () => {
    trySendBrandedPasswordReset.mockResolvedValue(true)
    expect(await sendPasswordReset(null, form({ email: 'U@Example.com' }))).toEqual(NEUTRAL)
    expect(trySendBrandedPasswordReset).toHaveBeenCalledWith('u@example.com')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('asks GoTrue for the mail with the recovery callback when the branded path declined', async () => {
    expect(await sendPasswordReset(null, form({ email: 'U@Example.com' }))).toEqual(NEUTRAL)
    expect(trySendBrandedPasswordReset).toHaveBeenCalledWith('u@example.com')
    expect(checkRateLimit).toHaveBeenCalledWith('reset:203.0.113.9', 5, 3600)
    expect(checkRateLimit).toHaveBeenCalledWith('reset-address:u@example.com', 5, 3600)
    expect(resetPasswordForEmail).toHaveBeenCalledWith('u@example.com', {
      redirectTo: 'https://kenyonexpress.co.il/auth/callback?next=/reset-password',
    })
  })

  it('answers the same sentence on a provider failure, and logs the reason', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'no such user' } })
    expect(await sendPasswordReset(null, form({ email: 'u@example.com' }))).toEqual(NEUTRAL)
    expect(logError).toHaveBeenCalledWith('auth.password_reset_failed', { reason: 'no such user' })
  })

  it('answers the same sentence under the per-address ceiling, without asking GoTrue', async () => {
    denied.add('reset-address:')
    expect(await sendPasswordReset(null, form({ email: 'u@example.com' }))).toEqual(NEUTRAL)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('refuses under the IP ceiling and on a bad address', async () => {
    denied.add('reset:')
    expect(await sendPasswordReset(null, form({ email: 'u@example.com' }))).toEqual({
      error: TOO_MANY,
    })
    denied.clear()
    expect(await sendPasswordReset(null, form({ email: 'nope' }))).toEqual({
      error: 'כתובת אימייל לא תקינה',
    })
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('updatePassword', () => {
  const VALID = { password: 'NewSecret2', confirm_password: 'NewSecret2' }

  it('sets the password on the recovery session and goes home', async () => {
    await updatePassword(null, form(VALID))
    expect(checkRateLimit).toHaveBeenCalledWith('update-password:203.0.113.9', 10, 3600)
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewSecret2' })
    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('refuses under the ceiling and on a mismatch, and names the expired link', async () => {
    denied.add('update-password:')
    expect(await updatePassword(null, form(VALID))).toEqual({ error: TOO_MANY })
    denied.clear()
    expect(await updatePassword(null, form({ ...VALID, confirm_password: 'Other' }))).toEqual({
      error: 'הסיסמאות אינן תואמות',
    })
    expect(updateUser).not.toHaveBeenCalled()
    updateUser.mockResolvedValue({ data: null, error: { message: 'Auth session missing!' } })
    expect(await updatePassword(null, form(VALID))).toEqual({
      error: 'קישור האיפוס פג או שכבר נעשה בו שימוש — בקשו קישור חדש',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})
