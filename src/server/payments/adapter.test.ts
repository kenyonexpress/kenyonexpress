import { getPaymentProvider } from '@/lib/payments'
import type { PaymentProvider } from '@/lib/payments/types'
import {
  type WebhookJournalClient,
  type WebhookJournalRow,
  createPayment,
  guardOrderTransition,
  journalWebhookEvent,
  planTokenization,
  resolvePaymentMode,
} from '@/server/payments/adapter'
import { afterEach, describe, expect, it, vi } from 'vitest'

const LIVE = {
  NODE_ENV: 'production',
  CARDCOM_TERMINAL_NUMBER: '172012',
  CARDCOM_API_NAME: 'api',
  CARDCOM_API_PASSWORD: 'pw',
  CARDCOM_WEBHOOK_SECRET: 'whs',
  NEXT_PUBLIC_APP_URL: 'https://www.kenyonexpress.co.il',
  CHECKOUT_ENABLED: 'true',
}

function env(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv
}

describe('resolvePaymentMode', () => {
  it('is live with full real credentials', () => {
    expect(resolvePaymentMode(env(LIVE))).toEqual({
      mode: 'live',
      checkoutAllowed: true,
      reason: null,
      missing: [],
    })
  })

  it('is sandbox, not a throw, on a production build with no credentials', () => {
    const report = resolvePaymentMode(
      env({ NODE_ENV: 'production', CHECKOUT_ENABLED: 'true', VERCEL_ENV: 'production' }),
    )
    expect(report.mode).toBe('sandbox')
    expect(report.checkoutAllowed).toBe(false)
    expect(report.reason).toMatch(/no Cardcom credentials/)
    expect(report.missing).toEqual([
      'CARDCOM_TERMINAL_NUMBER',
      'CARDCOM_API_NAME',
      'CARDCOM_API_PASSWORD',
      'CARDCOM_WEBHOOK_SECRET',
    ])
  })

  it('keeps an explicit mock build open for the local E2E run', () => {
    const report = resolvePaymentMode(
      env({ NODE_ENV: 'production', CARDCOM_USE_MOCK: 'true', CHECKOUT_ENABLED: 'true' }),
    )
    expect(report).toMatchObject({ mode: 'sandbox', checkoutAllowed: true, reason: null })
  })

  it('still refuses the mock on the customer-facing deployment', () => {
    const report = resolvePaymentMode(
      env({
        NODE_ENV: 'production',
        CARDCOM_USE_MOCK: 'true',
        VERCEL_ENV: 'production',
        CHECKOUT_ENABLED: 'true',
      }),
    )
    expect(report.checkoutAllowed).toBe(false)
    expect(report.reason).toMatch(/CARDCOM_USE_MOCK/)
  })

  it('reports partial credentials as sandbox with checkout closed instead of throwing', () => {
    const report = resolvePaymentMode(env({ ...LIVE, CARDCOM_API_PASSWORD: '' }))
    expect(report).toMatchObject({ mode: 'sandbox', checkoutAllowed: false })
    expect(report.reason).toMatch(/CARDCOM_API_PASSWORD/)
    expect(report.missing).toEqual(['CARDCOM_API_PASSWORD'])
  })

  it('calls the shared test terminal sandbox even with every credential set', () => {
    expect(resolvePaymentMode(env({ ...LIVE, CARDCOM_TERMINAL_NUMBER: '1000' })).mode).toBe(
      'sandbox',
    )
    expect(resolvePaymentMode(env({ ...LIVE, CARDCOM_SANDBOX: 'true' })).mode).toBe('sandbox')
  })

  it('is sandbox and open in development with nothing set', () => {
    expect(resolvePaymentMode(env({ NODE_ENV: 'development' }))).toMatchObject({
      mode: 'sandbox',
      checkoutAllowed: true,
    })
  })
})

const INPUT = {
  paymentId: 'pay-1',
  orderId: 'ord-1',
  orderNumber: 'ORD1',
  amountAgorot: 12_300 as never,
  saveToken: true,
  successRedirectUrl: 'https://x/ok',
  failedRedirectUrl: 'https://x/fail',
  webhookUrl: 'https://x/hook',
  description: 'הזמנה',
}

function fakeProvider(impl: PaymentProvider['createLowProfile']): PaymentProvider {
  return { createLowProfile: vi.fn(impl) } as unknown as PaymentProvider
}

describe('createPayment', () => {
  it('opens a page in sandbox and never charges outside the provider', async () => {
    const provider = fakeProvider(async () => ({
      lowProfileId: 'lp-1',
      redirectUrl: 'https://sandbox/lp-1',
      raw: {},
    }))
    const result = await createPayment(INPUT, {
      source: env({ NODE_ENV: 'development' }),
      provider,
    })
    expect(result).toEqual({
      ok: true,
      mode: 'sandbox',
      lowProfile: { lowProfileId: 'lp-1', redirectUrl: 'https://sandbox/lp-1', raw: {} },
    })
    expect(provider.createLowProfile).toHaveBeenCalledWith(INPUT)
  })

  it('refuses before calling the provider when checkout is closed', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('must not be called')
    })
    const result = await createPayment(INPUT, {
      source: env({ NODE_ENV: 'production', VERCEL_ENV: 'production', CHECKOUT_ENABLED: 'true' }),
      provider,
    })
    expect(result).toMatchObject({ ok: false, mode: 'sandbox', code: 'CHECKOUT_DISABLED' })
    expect(provider.createLowProfile).not.toHaveBeenCalled()
  })

  it('turns a provider error into a result, not a throw', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('cardcom 500')
    })
    const result = await createPayment(INPUT, { source: env(LIVE), provider })
    expect(result).toEqual({
      ok: false,
      mode: 'live',
      code: 'PROVIDER_FAILED',
      reason: 'cardcom 500',
    })
  })
})

/** A journal with the real table's UNIQUE(provider, external_event_id). */
function fakeJournal(failWith?: { code?: string; message: string }) {
  const rows: WebhookJournalRow[] = []
  const client: WebhookJournalClient = {
    from: () => ({
      insert: async (row) => {
        if (failWith) return { error: failWith }
        if (
          rows.some(
            (r) => r.provider === row.provider && r.external_event_id === row.external_event_id,
          )
        ) {
          return { error: { code: '23505', message: 'duplicate key' } }
        }
        rows.push(row)
        return { error: null }
      },
    }),
  }
  return { client, rows }
}

const ROW: WebhookJournalRow = {
  provider: 'cardcom',
  external_event_id: 'lp-1:555',
  signature_valid: true,
  verified_against_api: false,
  payload: { lowprofilecode: 'lp-1' },
}

describe('journalWebhookEvent', () => {
  it('writes once and answers replay on every redelivery', async () => {
    const { client, rows } = fakeJournal()
    expect(await journalWebhookEvent(client, ROW)).toEqual({ kind: 'new' })
    expect(await journalWebhookEvent(client, ROW)).toEqual({ kind: 'replay' })
    expect(await journalWebhookEvent(client, ROW)).toEqual({ kind: 'replay' })
    expect(rows).toHaveLength(1)
  })

  it('treats a different deal on the same page as a new event', async () => {
    const { client, rows } = fakeJournal()
    await journalWebhookEvent(client, ROW)
    expect(await journalWebhookEvent(client, { ...ROW, external_event_id: 'lp-1:556' })).toEqual({
      kind: 'new',
    })
    expect(rows).toHaveLength(2)
  })

  it('never reports a non-unique failure as a replay', async () => {
    const { client } = fakeJournal({ code: '08006', message: 'connection reset' })
    expect(await journalWebhookEvent(client, ROW)).toEqual({
      kind: 'failed',
      code: '08006',
      message: 'connection reset',
    })
  })
})

describe('guardOrderTransition', () => {
  it('allows pending -> paid -> split_executed', () => {
    expect(guardOrderTransition('pending', 'PAYMENT_CONFIRMED')).toEqual({
      ok: true,
      from: 'pending',
      to: 'paid',
    })
    expect(guardOrderTransition('paid', 'EXECUTE_SPLIT')).toEqual({
      ok: true,
      from: 'paid',
      to: 'split_executed',
    })
  })

  it('refuses a second payment confirmation and any move out of a terminal state', () => {
    expect(guardOrderTransition('paid', 'PAYMENT_CONFIRMED')).toMatchObject({
      ok: false,
      code: 'ILLEGAL_TRANSITION',
    })
    expect(guardOrderTransition('refunded', 'REFUND').ok).toBe(false)
    expect(guardOrderTransition('cancelled', 'PAYMENT_CONFIRMED').ok).toBe(false)
    expect(guardOrderTransition('pending', 'EXECUTE_SPLIT').ok).toBe(false)
  })
})

describe('planTokenization', () => {
  it('mints a token on a hosted-page purchase when the shopper kept save-card on', () => {
    expect(
      planTokenization({ saveCardOptIn: true, chargingSavedToken: false, threeDSFallback: false }),
    ).toBe(true)
  })

  it('respects an opt-out', () => {
    expect(
      planTokenization({ saveCardOptIn: false, chargingSavedToken: false, threeDSFallback: false }),
    ).toBe(false)
  })

  it('cannot mint while charging an existing token', () => {
    expect(
      planTokenization({ saveCardOptIn: true, chargingSavedToken: true, threeDSFallback: false }),
    ).toBe(false)
  })

  it('re-mints after a 3DS fallback regardless of the checkbox', () => {
    expect(
      planTokenization({ saveCardOptIn: false, chargingSavedToken: false, threeDSFallback: true }),
    ).toBe(true)
  })
})

describe('getPaymentProvider on a production build with no credentials', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses the mock, so no cron can verify or charge against it', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CARDCOM_USE_MOCK', '')
    vi.stubEnv('CARDCOM_TERMINAL_NUMBER', '')
    expect(() => getPaymentProvider()).toThrow(/no Cardcom credentials/)
  })

  it('still hands out the mock to an explicit mock build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CARDCOM_USE_MOCK', 'true')
    vi.stubEnv('CARDCOM_TERMINAL_NUMBER', '')
    expect(getPaymentProvider().name).toBe('mock')
  })
})
