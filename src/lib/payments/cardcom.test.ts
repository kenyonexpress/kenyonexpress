import { agorot } from '@/lib/commerce/money'
import type { CardcomAccount } from '@/lib/payments/accounts'
import { CardcomProvider } from '@/lib/payments/cardcom'
import type { CreateDocumentInput } from '@/lib/payments/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The client that actually talks to Cardcom had NO tests at all.
 *
 * Every checkout test in this repo runs `MockCardcomProvider`, so the 423 lines
 * that build the legacy `/Interface/*.aspx` form fields and parse what comes
 * back were covered by nothing. That is the wrong half to leave untested: the
 * mock is ours and cannot surprise us, and this is the part that meets a system
 * we do not control.
 *
 * WHAT THESE TESTS CAN AND CANNOT ESTABLISH. There are no `CARDCOM_*`
 * credentials on this machine (a standing GO/NO-GO item, Ofir's keys), so
 * nothing here proves Cardcom ACCEPTS these field names -- several are marked
 * unverified in `cardcom.ts` itself and stay that way. What they do prove is
 * the half that is ours: that the fields we intend to send are the fields that
 * go on the wire, that every documented response spelling is read, and that a
 * failure is reported as a failure. When the sandbox terminal finally exists,
 * a wrong field name is then a one-line diff against a named expectation
 * instead of an afternoon inside a network log.
 */

const account: CardcomAccount = {
  id: 'platform',
  label: 'Platform',
  terminalNumber: '1000',
  apiName: 'test-api-name',
  apiPassword: 'test-api-password',
  sandbox: true,
  supplierIds: [],
}

let fetchMock: ReturnType<typeof vi.fn>

/** The form fields the client posted, decoded back out of the request body. */
function sentFields(callIndex = 0): Record<string, string> {
  const call = fetchMock.mock.calls[callIndex]
  if (!call) throw new Error(`no fetch call at ${callIndex}`)
  const body = call[1]?.body as URLSearchParams
  return Object.fromEntries(new URLSearchParams(body).entries())
}

function sentUrl(callIndex = 0): string {
  const call = fetchMock.mock.calls[callIndex]
  if (!call) throw new Error(`no fetch call at ${callIndex}`)
  return String(call[0])
}

/** Cardcom answers JSON on some endpoints and form-urlencoded on others. */
function respondJson(body: unknown) {
  fetchMock.mockResolvedValue({ text: async () => JSON.stringify(body) })
}

function respondForm(body: Record<string, string>) {
  fetchMock.mockResolvedValue({ text: async () => new URLSearchParams(body).toString() })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('CARDCOM_API_BASE_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function provider() {
  return new CardcomProvider(account)
}

const lowProfileInput = {
  paymentId: 'pay-1',
  orderId: 'ord-1',
  orderNumber: 'KE-1',
  amountAgorot: agorot(12_990),
  saveToken: false,
  successRedirectUrl: 'https://ke.example/checkout/return',
  failedRedirectUrl: 'https://ke.example/checkout/failed',
  webhookUrl: 'https://ke.example/api/payments/cardcom/webhook?s=secret',
  description: 'הזמנה KE-1',
}

describe('CardcomProvider.createLowProfile', () => {
  it('posts the terminal, the amount in shekels, and the correlation id', async () => {
    respondJson({ ResponseCode: 0, LowProfileCode: 'lp-1', Url: 'https://pay.example/lp-1' })

    const result = await provider().createLowProfile(lowProfileInput)

    expect(sentUrl()).toBe('https://secure.cardcom.solutions/Interface/LowProfile.aspx')
    const fields = sentFields()
    expect(fields.TerminalNumber).toBe('1000')
    expect(fields.ApiName).toBe('test-api-name')
    // Agorot in, shekels with two decimals out. Cardcom's convention, and the
    // only place in the money path where that conversion is legal.
    expect(fields.Amount).toBe('129.90')
    // `ReturnValue` is what comes back on the webhook and is how a callback is
    // matched to a payment row at all.
    expect(fields.ReturnValue).toBe('pay-1')
    expect(fields.IndicatorUrl).toBe(lowProfileInput.webhookUrl)
    expect(result).toMatchObject({ lowProfileId: 'lp-1', redirectUrl: 'https://pay.example/lp-1' })
  })

  it('asks for a token only when the caller wants one stored', async () => {
    respondJson({ ResponseCode: 0, LowProfileCode: 'lp-1', Url: 'https://pay.example/lp-1' })
    await provider().createLowProfile(lowProfileInput)
    expect(sentFields().Operation).toBe('ChargeOnly')

    fetchMock.mockClear()
    respondJson({ ResponseCode: 0, LowProfileCode: 'lp-2', Url: 'https://pay.example/lp-2' })
    await provider().createLowProfile({ ...lowProfileInput, saveToken: true })
    expect(sentFields().Operation).toBe('ChargeAndCreateToken')
  })

  it('truncates a long description rather than letting the terminal reject the call', async () => {
    respondJson({ ResponseCode: 0, LowProfileCode: 'lp-1', Url: 'https://pay.example/lp-1' })

    await provider().createLowProfile({ ...lowProfileInput, description: 'א'.repeat(400) })

    expect(sentFields().ProductName).toHaveLength(120)
  })

  it('throws rather than returning a redirect the shopper cannot use', async () => {
    // No Url with a success code. Returning `{redirectUrl: null}` here would
    // send someone to a blank page holding an order that believes it is paying.
    respondJson({ ResponseCode: 0, LowProfileCode: 'lp-1' })

    await expect(provider().createLowProfile(lowProfileInput)).rejects.toThrow(
      /LowProfile create failed/,
    )
  })

  it('throws on a non-zero response code', async () => {
    respondJson({ ResponseCode: 500, Description: 'terminal disabled' })

    await expect(provider().createLowProfile(lowProfileInput)).rejects.toThrow(/code=500/)
  })
})

describe('CardcomProvider.verifyLowProfile', () => {
  /**
   * The single most trusted read in the system. Cardcom does not sign its
   * webhooks, so this server-to-server call is the only authority on whether
   * money moved and how much.
   */
  it('reads the amount as exact agorot, never through a float', async () => {
    respondForm({ ResponseCode: '0', Amount: '129.90', InternalDealNumber: 'deal-9' })

    const result = await provider().verifyLowProfile('lp-1')

    expect(result.success).toBe(true)
    expect(result.amountAgorot).toBe(12_990)
    expect(Number.isInteger(result.amountAgorot)).toBe(true)
    expect(result.transactionId).toBe('deal-9')
  })

  it('reports no amount rather than a guessed one when the value is unreadable', async () => {
    // The webhook treats a null amount as "do not finalize, raise the alarm",
    // which is the safe direction. A rounded guess would be compared against
    // the order and could match.
    respondForm({ ResponseCode: '0', Amount: 'n/a', InternalDealNumber: 'deal-9' })

    expect((await provider().verifyLowProfile('lp-1')).amountAgorot).toBeNull()
  })

  it('refuses sub-agora precision instead of rounding it away', async () => {
    respondForm({ ResponseCode: '0', Amount: '129.905' })

    expect((await provider().verifyLowProfile('lp-1')).amountAgorot).toBeNull()
  })

  it('accepts trailing zeros past the agora, which are not extra precision', async () => {
    respondForm({ ResponseCode: '0', Amount: '129.900' })

    expect((await provider().verifyLowProfile('lp-1')).amountAgorot).toBe(12_990)
  })

  it('reads the lowercase spellings the legacy interface also answers in', async () => {
    respondForm({ responsecode: '0', amount: '10.00', internaldealnumber: 'deal-x' })

    const result = await provider().verifyLowProfile('lp-1')

    expect(result.success).toBe(true)
    expect(result.amountAgorot).toBe(1_000)
    expect(result.transactionId).toBe('deal-x')
  })

  it('carries the card details back only when a token was actually returned', async () => {
    respondForm({
      ResponseCode: '0',
      Amount: '10.00',
      Token: 'tok-1',
      Last4CardDigits: '4242',
      CardBrand: 'Visa',
      CardValidityMonth: '7',
      CardValidityYear: '2030',
    })

    expect((await provider().verifyLowProfile('lp-1')).token).toEqual({
      token: 'tok-1',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 7,
      expiryYear: 2030,
    })

    fetchMock.mockClear()
    respondForm({ ResponseCode: '0', Amount: '10.00' })
    expect((await provider().verifyLowProfile('lp-1')).token).toBeUndefined()
  })

  it('is not a success just because the call returned', async () => {
    respondForm({ ResponseCode: '901', Description: 'not found' })

    expect((await provider().verifyLowProfile('lp-1')).success).toBe(false)
  })
})

describe('CardcomProvider.chargeWithToken', () => {
  it('reports a decline as a failure result rather than throwing', async () => {
    // The caller is a scheduled recurring charge; a throw there is an unhandled
    // rejection in a cron, while a decline is an ordinary outcome to record.
    respondForm({ ResponseCode: '33', Description: 'card declined' })

    const result = await provider().chargeWithToken({
      cardcomToken: 'tok-1',
      amountAgorot: agorot(5_000),
      description: 'renewal',
      paymentId: 'pay-2',
      orderId: 'ord-2',
    })

    expect(result).toMatchObject({
      success: false,
      transactionId: null,
      failureCode: '33',
      failureMessage: 'card declined',
    })
  })

  it('sends the token and the amount in shekels on success', async () => {
    respondForm({ ResponseCode: '0', InternalDealNumber: 'deal-2' })

    const result = await provider().chargeWithToken({
      cardcomToken: 'tok-1',
      amountAgorot: agorot(5_000),
      description: 'renewal',
      paymentId: 'pay-2',
      orderId: 'ord-2',
    })

    expect(sentUrl()).toContain('/Interface/ChargeToken.aspx')
    expect(sentFields().Token).toBe('tok-1')
    expect(sentFields().Amount).toBe('50.00')
    expect(result).toMatchObject({ success: true, transactionId: 'deal-2' })
  })
})

describe('CardcomProvider.refundByTransactionId', () => {
  it('sends the password, which the read-only calls do not', async () => {
    respondForm({ ResponseCode: '0', NewDealNumber: 'refund-1' })

    const result = await provider().refundByTransactionId({
      transactionId: 'deal-1',
      amountAgorot: agorot(12_990),
      description: 'refund',
    })

    expect(sentUrl()).toContain('/Interface/RefundDeal.aspx')
    expect(sentFields().ApiPassword).toBe('test-api-password')
    expect(sentFields().Amount).toBe('129.90')
    expect(result).toMatchObject({ success: true, refundTransactionId: 'refund-1' })
  })

  it('refunds the partial amount when one is given, not the original charge', async () => {
    respondForm({ ResponseCode: '0', NewDealNumber: 'refund-2' })

    const result = await provider().refundByTransactionId({
      transactionId: 'deal-1',
      amountAgorot: agorot(12_990),
      partialAmountAgorot: agorot(2_000),
      description: 'partial',
    })

    expect(sentFields().Amount).toBe('20.00')
    expect(result.refundedAgorot).toBe(2_000)
  })

  it('carries CancelOnly only when the caller asked to cancel', async () => {
    respondForm({ ResponseCode: '0', NewDealNumber: 'refund-3' })
    await provider().refundByTransactionId({
      transactionId: 'deal-1',
      amountAgorot: agorot(1_000),
      description: 'r',
    })
    expect(sentFields().CancelOnly).toBeUndefined()

    fetchMock.mockClear()
    respondForm({ ResponseCode: '0', NewDealNumber: 'refund-4' })
    await provider().refundByTransactionId({
      transactionId: 'deal-1',
      amountAgorot: agorot(1_000),
      cancelOnly: true,
      description: 'r',
    })
    // A cancellation is still OF a specific deal, so the amount goes with it.
    expect(sentFields().CancelOnly).toBe('true')
    expect(sentFields().Amount).toBe('10.00')
  })

  it('reports a refused refund without inventing a refunded amount', async () => {
    respondForm({ ResponseCode: '700', Description: 'too late to credit' })

    expect(
      await provider().refundByTransactionId({
        transactionId: 'deal-1',
        amountAgorot: agorot(1_000),
        description: 'r',
      }),
    ).toMatchObject({ success: false, refundTransactionId: null, refundedAgorot: null })
  })
})

describe('CardcomProvider.listTransactions', () => {
  it('reads the flat Transaction<N>. rows and stops at the first gap', async () => {
    respondForm({
      ResponseCode: '0',
      'Transaction1.InternalDealNumber': 'deal-1',
      'Transaction1.Sum': '129.90',
      'Transaction1.DealType': '1',
      'Transaction2.InternalDealNumber': 'deal-2',
      'Transaction2.Sum': '50.00',
      'Transaction2.DealType': '3',
      // No Transaction3, and a Transaction4 that must never be reached: the
      // loop trusts the gap rather than a count field.
      'Transaction4.InternalDealNumber': 'deal-4',
      'Transaction4.Sum': '10.00',
    })

    const result = await provider().listTransactions({
      fromIso: '2026-08-01T00:00:00.000Z',
      toIso: '2026-08-19T00:00:00.000Z',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0]).toMatchObject({
      transactionId: 'deal-1',
      amountAgorot: 12_990,
      isRefund: false,
    })
    expect(result.transactions[1]).toMatchObject({ transactionId: 'deal-2', isRefund: true })
  })

  it('sends the window as the ddMMyyyy the legacy report expects', async () => {
    respondForm({ ResponseCode: '0' })

    await provider().listTransactions({
      fromIso: '2026-08-01T00:00:00.000Z',
      toIso: '2026-08-19T00:00:00.000Z',
    })

    expect(sentFields().FromDate).toBe('01082026')
    expect(sentFields().ToDate).toBe('19082026')
  })

  it('returns a reason instead of throwing when the terminal is unreachable', async () => {
    // Reconciliation runs on a cron. A throw there is a silent dead job; a
    // `{ok: false, reason}` is a report that says it could not run.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    expect(
      await provider().listTransactions({
        fromIso: '2026-08-01T00:00:00.000Z',
        toIso: '2026-08-19T00:00:00.000Z',
      }),
    ).toEqual({ ok: false, reason: 'ECONNREFUSED' })
  })

  it('reports an empty list rather than a false alarm on an unrecognised shape', async () => {
    // Documented behaviour in `cardcom.ts`: an unparseable response makes the
    // report say "everything of ours is missing remotely", which is the
    // low-severity bucket and never pages anyone.
    respondJson({ ResponseCode: 0, SomethingElse: 'entirely' })

    const result = await provider().listTransactions({
      fromIso: '2026-08-01T00:00:00.000Z',
      toIso: '2026-08-19T00:00:00.000Z',
    })

    expect(result).toEqual({ ok: true, transactions: [] })
  })
})

describe('CardcomProvider.createDocument', () => {
  const line = {
    description: 'מוצר',
    unitPriceAgorot: agorot(10_000),
    quantity: 2,
    totalAgorot: agorot(20_000),
  }

  function document(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
    return {
      documentType: 'tax_invoice_receipt',
      customerName: 'לקוח',
      customerEmail: null,
      customerPhone: null,
      lines: [line],
      totalAgorot: agorot(20_000),
      vatPercent: 18,
      transactionId: null,
      reference: 'KE-1',
      sendByEmail: false,
      ...overrides,
    }
  }

  it('sends 1-indexed flat line fields priced as VAT-inclusive', async () => {
    respondForm({ ResponseCode: '0', InvoiceResponse_InvoiceNumber: '5001' })

    await provider().createDocument(
      document({ lines: [line, { ...line, quantity: 1, totalAgorot: agorot(10_000) }] }),
    )

    const fields = sentFields()
    expect(fields['InvoiceLines1.Price']).toBe('100.00')
    expect(fields['InvoiceLines1.Quantity']).toBe('2')
    expect(fields['InvoiceLines2.Quantity']).toBe('1')
    // Catalogue prices already include VAT; saying otherwise adds it twice.
    expect(fields['InvoiceLines1.IsPriceIncludeVAT']).toBe('true')
  })

  it('sends no InvoiceType for a tax invoice, so the terminal default stands', async () => {
    respondForm({ ResponseCode: '0', InvoiceResponse_InvoiceNumber: '5001' })

    await provider().createDocument(document())

    // The terminal's own default IS the tax invoice + receipt. Overriding it
    // with a guessed code would be a change in the wrong direction.
    expect(sentFields()['InvoiceHead.InvoiceType']).toBeUndefined()
  })

  it('distinguishes a coupon receipt from a credit note, and lets env correct both', async () => {
    respondForm({ ResponseCode: '0', InvoiceResponse_InvoiceNumber: '5002' })
    await provider().createDocument(document({ documentType: 'coupon_receipt' }))
    expect(sentFields()['InvoiceHead.InvoiceType']).toBe('4')

    fetchMock.mockClear()
    vi.stubEnv('CARDCOM_CREDIT_NOTE_TYPE', '330')
    respondForm({ ResponseCode: '0', InvoiceResponse_InvoiceNumber: '5003' })
    await provider().createDocument(document({ documentType: 'credit_note' }))
    // The codes are unverified against a live terminal, which is exactly why
    // they are env-overridable: correcting one must not need a deploy.
    expect(sentFields()['InvoiceHead.InvoiceType']).toBe('330')
  })

  it('fails rather than reporting an issued document with no number', async () => {
    // The failure mode has to be a visible unissued queue, never an
    // `orders.invoice_number` written from a response nobody can look up.
    respondForm({ ResponseCode: '0' })

    expect(await provider().createDocument(document())).toMatchObject({
      success: false,
      documentNumber: null,
      failureMessage: 'Cardcom returned no document number',
    })
  })
})

describe('CardcomProvider transport', () => {
  it('parses a JSON body and a form body identically', async () => {
    respondJson({ ResponseCode: 0, Amount: '10.00', InternalDealNumber: 'deal-j' })
    const fromJson = await provider().verifyLowProfile('lp-1')

    fetchMock.mockClear()
    respondForm({ ResponseCode: '0', Amount: '10.00', InternalDealNumber: 'deal-j' })
    const fromForm = await provider().verifyLowProfile('lp-1')

    expect(fromJson.amountAgorot).toBe(fromForm.amountAgorot)
    expect(fromJson.transactionId).toBe(fromForm.transactionId)
    expect(fromJson.success).toBe(fromForm.success)
  })

  it('honours CARDCOM_API_BASE_URL and strips a trailing slash', async () => {
    vi.stubEnv('CARDCOM_API_BASE_URL', 'https://sandbox.cardcom.example/')
    respondForm({ ResponseCode: '0', Amount: '10.00' })

    await provider().verifyLowProfile('lp-1')

    // The seam a sandbox run goes through, so it is worth one assertion: a
    // doubled slash would 404 against a real host.
    expect(sentUrl()).toBe('https://sandbox.cardcom.example/Interface/GetLpResult.aspx')
  })

  it('falls back to the real host when the override is present but blank', async () => {
    // Found by this file. `CARDCOM_API_BASE_URL=` is how a variable someone
    // cleared in a dashboard reads, an empty string is not nullish, and the
    // `??` it used to rely on let it through -- making every call a RELATIVE
    // url that `fetch` cannot parse on a server. Checkout then fails as a
    // network error instead of using the host that was there all along.
    vi.stubEnv('CARDCOM_API_BASE_URL', '   ')
    respondForm({ ResponseCode: '0', Amount: '10.00' })

    await provider().verifyLowProfile('lp-1')

    expect(sentUrl()).toBe('https://secure.cardcom.solutions/Interface/GetLpResult.aspx')
  })

  it('posts form-urlencoded, which is what the legacy interface accepts', async () => {
    respondForm({ ResponseCode: '0', Amount: '10.00' })

    await provider().verifyLowProfile('lp-1')

    const init = fetchMock.mock.calls[0]?.[1]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  })
})
