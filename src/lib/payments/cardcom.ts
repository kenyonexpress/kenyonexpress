import { agorot } from '@/lib/commerce/money'
import { log } from '@/lib/observability/log'
import { type CardcomAccount, loadCardcomAccounts } from '@/lib/payments/accounts'
import {
  parseTerminalAmountAgorot,
  terminalAmountToAgorot,
} from '@/lib/payments/terminal-reconciliation'
import type {
  ChargeWithTokenInput,
  ChargeWithTokenResult,
  CreateDocumentInput,
  CreateDocumentResult,
  CreateLowProfileInput,
  CreateLowProfileResult,
  ListTransactionsResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  TerminalTransactionRow,
  VerifyLowProfileResult,
} from '@/lib/payments/types'

type CardcomJson = Record<string, unknown>

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number') return String(value)
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Cardcom Low Profile HTTP adapter, bound to ONE account.
 *
 * Amounts are sent as ILS with 2 decimals (Cardcom convention); we convert from
 * agorot at the boundary.
 *
 * One instance means one terminal, deliberately. Cardcom scopes both tokens and
 * Low Profile ids to the terminal that created them, so an instance that could
 * switch accounts between calls would let a verify or a token charge land on a
 * terminal that has never heard of the artefact and answer "not found" for a
 * payment the customer really made. Callers get an instance from
 * `getPaymentProvider(accountId)` and carry the id alongside whatever they
 * store.
 */
/**
 * How long any single Cardcom call may take.
 *
 * Read per call rather than at module load, for the same reason the Upstash
 * config is: a value pinned at module load survives for the life of a warm
 * instance. 15s is well past Cardcom's normal response and well under the
 * platform's own request ceiling, which is what leaves room for the one retry
 * on the read-only paths.
 */
function cardcomTimeoutMs(): number {
  const parsed = Number(process.env.CARDCOM_TIMEOUT_MS)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 15_000
}

export class CardcomProvider implements PaymentProvider {
  readonly name = 'cardcom' as const
  readonly account: CardcomAccount

  constructor(account?: CardcomAccount) {
    this.account = account ?? loadCardcomAccounts(process.env, { mock: false }).platform
  }

  /**
   * Where the legacy interface lives, overridable for a sandbox host.
   *
   * BLANK IS ABSENT, and it has to be checked rather than left to `??`. An
   * empty string is not nullish, so `CARDCOM_API_BASE_URL=` -- which is exactly
   * how a variable someone cleared in a dashboard reads -- used to survive the
   * `??` and make every path below a RELATIVE url. `fetch('/Interface/...')`
   * has no origin to resolve against on a server, so it throws "Failed to parse
   * URL", and checkout fails as a network error rather than by falling back to
   * the host that was there all along. `env.ts` already treats whitespace as
   * absence for the secrets, for the same reason.
   */
  private baseUrl(): string {
    const configured = process.env.CARDCOM_API_BASE_URL?.trim()
    if (!configured) return 'https://secure.cardcom.solutions'
    return configured.replace(/\/+$/, '')
  }

  /**
   * A CALL THAT CHARGES A CARD IS NOT RETRIED. Everything here follows from
   * that.
   *
   * This used to be a bare `fetch` with no timeout and no retry. No timeout
   * means a Cardcom that accepts the connection and never answers holds the
   * request open until the platform kills it, with the customer watching a
   * spinner and the order in `pending`.
   *
   * A timeout alone would be an improvement and a trap. The dangerous half is
   * the retry: a POST to `ChargeToken.aspx` that times out has NOT necessarily
   * failed. The request may have arrived, the card may be charged, and only the
   * response may be lost. Retrying that is how a customer is charged twice, and
   * the legacy interface offers no idempotency key to make it safe -- verified
   * against the endpoints actually in use, all six of which are
   * `/Interface/*.aspx` form posts.
   *
   * So retry is OPT-IN, per call site, and off by default:
   *
   *   GetLpResult.aspx       read-only          RETRY
   *   ListTransactions.aspx  read-only          RETRY
   *   LowProfile.aspx        creates a page,
   *                          charges nothing    RETRY (a duplicate page is
   *                                             abandoned, not billed)
   *   ChargeToken.aspx       CHARGES            never
   *   RefundDeal.aspx        MOVES MONEY        never
   *   BillGoldPost.aspx      issues a document  never (a duplicate invoice is
   *                                             a real-world problem)
   *
   * The one retry is for a TRANSPORT failure only -- a timeout or a thrown
   * fetch. A response that arrives and says something we did not like is an
   * answer, not a failure to reach the provider, and it is returned as-is.
   */
  private async postForm(
    path: string,
    fields: Record<string, string>,
    options: { retryOnTransportFailure?: boolean } = {},
  ): Promise<CardcomJson> {
    const attempt = async (): Promise<Response> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), cardcomTimeoutMs())
      try {
        return await fetch(`${this.baseUrl()}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields),
          signal: controller.signal,
        })
      } finally {
        // Always, including on the success path: an uncleared timer keeps the
        // event loop alive and, in a long-lived process, aborts nothing while
        // still holding a reference to the controller.
        clearTimeout(timer)
      }
    }

    let response: Response
    try {
      response = await attempt()
    } catch (err) {
      if (!options.retryOnTransportFailure) throw err
      log.warn('cardcom.transport_retry', { path, reason: String(err) })
      response = await attempt()
    }
    const text = await response.text()
    try {
      return JSON.parse(text) as CardcomJson
    } catch {
      // Some Cardcom endpoints return form-urlencoded
      const params = new URLSearchParams(text)
      const obj: CardcomJson = {}
      for (const [k, v] of params.entries()) obj[k] = v
      return obj
    }
  }

  private ilsFromAgorot(amountAgorot: number): string {
    return (amountAgorot / 100).toFixed(2)
  }

  async createLowProfile(input: CreateLowProfileInput): Promise<CreateLowProfileResult> {
    const raw = await this.postForm(
      '/Interface/LowProfile.aspx',
      {
        TerminalNumber: this.account.terminalNumber,
        ApiName: this.account.apiName,
        Amount: this.ilsFromAgorot(input.amountAgorot),
        CoinId: '1',
        Language: 'he',
        ProductName: input.description.slice(0, 120),
        SuccessRedirectUrl: input.successRedirectUrl,
        ErrorRedirectUrl: input.failedRedirectUrl,
        IndicatorUrl: input.webhookUrl,
        ReturnValue: input.paymentId,
        Operation: input.saveToken ? 'ChargeAndCreateToken' : 'ChargeOnly',
        Codepage: '65001',
      },
      // Creating a hosted page charges nothing. A duplicate page is abandoned
      // rather than billed, and the customer is waiting at checkout, so this is
      // the one write-shaped call where a retry is clearly worth it.
      { retryOnTransportFailure: true },
    )

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    const lowProfileId = asString(raw.LowProfileCode ?? raw.lowprofilecode)
    const url = asString(raw.Url ?? raw.url)

    if (responseCode !== 0 || !lowProfileId || !url) {
      throw new Error(
        `Cardcom LowProfile create failed: code=${responseCode} body=${JSON.stringify(raw)}`,
      )
    }

    return { lowProfileId, redirectUrl: url, raw }
  }

  async chargeWithToken(input: ChargeWithTokenInput): Promise<ChargeWithTokenResult> {
    const raw = await this.postForm('/Interface/ChargeToken.aspx', {
      TerminalNumber: this.account.terminalNumber,
      ApiName: this.account.apiName,
      Token: input.cardcomToken,
      Amount: this.ilsFromAgorot(input.amountAgorot),
      CoinId: '1',
      ProductName: input.description.slice(0, 120),
      Codepage: '65001',
    })

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    const transactionId = asString(raw.InternalDealNumber ?? raw.internaldealnumber)

    if (responseCode !== 0) {
      return {
        success: false,
        transactionId: null,
        failureCode: String(responseCode),
        failureMessage: asString(raw.Description ?? raw.description) ?? 'Cardcom declined',
        raw,
      }
    }

    return {
      success: true,
      transactionId,
      failureCode: null,
      failureMessage: null,
      raw,
    }
  }

  async refundByTransactionId(input: RefundInput): Promise<RefundResult> {
    const amountAgorot = input.partialAmountAgorot ?? input.amountAgorot
    // Legacy credit/refund. ApiPassword is mandatory for money-moving-back calls.
    // TODO(cardcom): confirm the exact legacy refund endpoint + field names against
    // the live terminal before go-live; kept legacy to match the rest of this client.
    //
    // CancelOnly is sent as a field rather than a different endpoint. Cardcom's
    // v11 doc models it that way (`RefundByTransactionId` + `CancelOnly: true`)
    // and the legacy interface takes the same flag; the amount still has to go
    // with it, because a cancellation is a cancellation OF a specific deal.
    const raw = await this.postForm('/Interface/RefundDeal.aspx', {
      TerminalNumber: this.account.terminalNumber,
      ApiName: this.account.apiName,
      ApiPassword: this.account.apiPassword,
      InternalDealNumber: input.transactionId,
      Amount: this.ilsFromAgorot(amountAgorot),
      CoinId: '1',
      Codepage: '65001',
      ...(input.cancelOnly ? { CancelOnly: 'true' } : {}),
    })

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    const refundTxId = asString(
      raw.NewDealNumber ?? raw.newdealnumber ?? raw.InternalDealNumber ?? raw.internaldealnumber,
    )

    if (responseCode !== 0) {
      return {
        success: false,
        refundTransactionId: null,
        refundedAgorot: null,
        failureCode: String(responseCode),
        failureMessage: asString(raw.Description ?? raw.description) ?? 'Cardcom refund failed',
        raw,
      }
    }

    return {
      success: true,
      refundTransactionId: refundTxId,
      refundedAgorot: agorot(amountAgorot),
      failureCode: null,
      failureMessage: null,
      raw,
    }
  }

  /**
   * Cardcom's document module: a tax invoice/receipt, or the credit note that
   * reverses one.
   *
   * WHAT IS VERIFIED HERE AND WHAT IS NOT. Everything ABOUT the document - the
   * lines, the VAT split, the total it must match - is computed and tested in
   * `lib/invoices/document.ts`. This method is only the wire format, and the
   * wire format is the one part of [55] that could not be measured: there is no
   * `CARDCOM_*` in this environment (it is a listed GO/NO-GO item, Ofir's
   * keys), `InvoiceHead`/`InvoiceLines` appear nowhere in `docs/`, `refs/` or
   * `src/`, and section 1.4 of `docs/CARDCOM-ARCHITECTURE.md` documents the v11
   * JSON endpoints (`/Documents/CreateDocument`) while this client is legacy
   * `/Interface/*.aspx` by a decision from 23.07.
   *
   * So the field names below are the legacy `BillGoldPost` shape and they are
   * NOT confirmed against a live terminal. They are kept in this one method,
   * built from one `field()` helper, so correcting them is a single edit rather
   * than a search. The caller's contract does not depend on them.
   *
   * TODO(cardcom): confirm endpoint + field names against the live terminal
   * before go-live, exactly as the refund path above still says.
   *
   * WHY A WRONG GUESS HERE IS NOT A SILENT WRONG DOCUMENT. A response is only
   * treated as success when `ResponseCode` is 0 AND a document number comes
   * back. Anything else returns `success: false` with the raw body, the
   * `invoices` row stays unissued with the reason on it, and `orders
   * .invoice_number` is not written. The failure mode is a visible queue, not
   * an invoice that says the wrong thing.
   */
  /**
   * The terminal's own transaction list for a window.
   *
   * `BillGoldGetLowProfileIndicator` and friends answer about ONE deal;
   * `ListTransactions` is the report endpoint on the legacy interface. Its
   * response is a flat form encoding, so the rows are read defensively by
   * prefix rather than by a documented schema - the wire format could not be
   * verified from this machine (no CARDCOM_* credentials here, and the only
   * doc in the repo describes v11 JSON while this client is legacy .aspx).
   *
   * WHAT THAT MEANS IN PRACTICE, said plainly: a terminal that answers in a
   * shape this parser does not recognise produces an EMPTY list, and an empty
   * list makes the reconciliation report "everything of ours is missing
   * remotely" - which is the low-severity bucket on purpose, and not a page.
   * The first real run against a live terminal is what confirms the field
   * names; until then this cannot raise a false alarm.
   */
  async listTransactions(input: {
    fromIso: string
    toIso: string
  }): Promise<ListTransactionsResult> {
    const day = (iso: string) => {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      const dd = String(date.getUTCDate()).padStart(2, '0')
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
      return `${dd}${mm}${date.getUTCFullYear()}`
    }

    let raw: CardcomJson
    try {
      raw = await this.postForm('/Interface/ListTransactions.aspx', {
        TerminalNumber: this.account.terminalNumber,
        UserName: this.account.apiName,
        FromDate: day(input.fromIso),
        ToDate: day(input.toIso),
      })
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'network error' }
    }

    const transactions: TerminalTransactionRow[] = []
    // Rows come back as `Transaction1.Field`, `Transaction2.Field`, ... The
    // loop stops at the first index with no deal number rather than trusting a
    // count field, because a count that disagrees with the rows would silently
    // truncate the report.
    for (let index = 1; index <= 5000; index++) {
      const dealNumber = asString(
        raw[`Transaction${index}.InternalDealNumber`] ??
          raw[`transaction${index}.internaldealnumber`],
      )
      if (!dealNumber) break

      const amount = asString(raw[`Transaction${index}.Sum`] ?? raw[`transaction${index}.sum`])
      const type = asString(
        raw[`Transaction${index}.DealType`] ?? raw[`transaction${index}.dealtype`],
      )

      transactions.push({
        transactionId: dealNumber,
        amountAgorot: terminalAmountToAgorot(amount),
        occurredAt: asString(raw[`Transaction${index}.Date`] ?? raw[`transaction${index}.date`]),
        // Cardcom's credit/refund deal type. Unknown types are treated as
        // charges, which is the conservative direction: a refund misread as a
        // charge shows up as a discrepancy to look at, while a charge misread
        // as a refund is silently dropped from the report.
        isRefund: type === '3' || type?.toLowerCase() === 'credit',
      })
    }

    return { ok: true, transactions }
  }

  async createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult> {
    const fields: Record<string, string> = {
      TerminalNumber: this.account.terminalNumber,
      UserName: this.account.apiName,
      Codepage: '65001',
      'InvoiceHead.CustName': input.customerName ?? 'לקוח',
      'InvoiceHead.Language': 'he',
      'InvoiceHead.CoinID': '1',
      // The document is a receipt for money already taken, so it is issued
      // against the deal rather than as a standalone demand for payment.
      'InvoiceHead.IsAutoCreateUpdateAccount': 'true',
      'InvoiceHead.Comments': input.reference,
    }

    if (input.customerEmail) {
      fields['InvoiceHead.Email'] = input.customerEmail
      fields['InvoiceHead.SendByEmail'] = input.sendByEmail ? 'true' : 'false'
    }
    if (input.customerPhone) fields['InvoiceHead.CustAddresLine1'] = input.customerPhone
    if (input.transactionId) fields.InternalDealNumber = input.transactionId

    // THE NUMERIC CODES CANNOT BE VERIFIED FROM THIS MACHINE, and that is why
    // two of the three are env-overridable rather than baked in. There are no
    // `CARDCOM_*` credentials here and the only document in the repo describes
    // the v11 JSON API, while this client is the legacy `/Interface/*.aspx` one
    // by the decision of 23.07. What IS knowable is which of our three
    // documents is being asked for; the mapping to Cardcom's `InvoiceType` is
    // the one thing that may need correcting against a live terminal, so it is
    // in one place and adjustable without a deploy.
    //
    // A sale keeps sending NO InvoiceType, which is the behaviour that has been
    // in this file since [55]: the terminal's own default is the tax invoice +
    // receipt, and overriding it with a guessed code would be a change in the
    // wrong direction.
    if (input.documentType === 'credit_note') {
      fields['InvoiceHead.InvoiceType'] = process.env.CARDCOM_CREDIT_NOTE_TYPE ?? '3'
    } else if (input.documentType === 'coupon_receipt') {
      // A receipt for money received, not a tax invoice: the coupon's payment
      // is an advance and the VAT event has not happened. Defaults to Cardcom's
      // receipt code; see `isTaxableDocument` for why the distinction exists.
      fields['InvoiceHead.InvoiceType'] = process.env.CARDCOM_COUPON_RECEIPT_TYPE ?? '4'
    }

    input.lines.forEach((line, index) => {
      // Cardcom's legacy line fields are 1-indexed and flat.
      const n = index + 1
      fields[`InvoiceLines${n}.Description`] = line.description
      fields[`InvoiceLines${n}.Price`] = this.ilsFromAgorot(line.unitPriceAgorot)
      fields[`InvoiceLines${n}.Quantity`] = String(line.quantity)
      // Catalogue prices are VAT-inclusive, which is what the builder computed
      // the split from. Telling Cardcom otherwise would add VAT a second time.
      fields[`InvoiceLines${n}.IsPriceIncludeVAT`] = 'true'
    })

    const raw = await this.postForm('/Interface/BillGoldPost.aspx', fields)

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    const documentNumber = asString(
      raw.InvoiceResponse_InvoiceNumber ??
        raw.invoiceresponse_invoicenumber ??
        raw.InvoiceNumber ??
        raw.invoicenumber,
    )
    const documentUrl = asString(
      raw.InvoiceResponse_DocumentUrl ??
        raw.invoiceresponse_documenturl ??
        raw.DocumentUrl ??
        raw.documenturl ??
        raw.InvoiceResponse_Url ??
        raw.url,
    )

    if (responseCode !== 0 || !documentNumber) {
      return {
        success: false,
        documentNumber: null,
        documentUrl: null,
        failureCode: String(responseCode),
        failureMessage:
          asString(raw.Description ?? raw.description) ??
          (documentNumber ? 'Cardcom document failed' : 'Cardcom returned no document number'),
        raw,
      }
    }

    return {
      success: true,
      documentNumber,
      documentUrl,
      failureCode: null,
      failureMessage: null,
      raw,
    }
  }

  async verifyLowProfile(lowProfileId: string): Promise<VerifyLowProfileResult> {
    const raw = await this.postForm(
      '/Interface/GetLpResult.aspx',
      {
        TerminalNumber: this.account.terminalNumber,
        ApiName: this.account.apiName,
        LowProfileCode: lowProfileId,
        Codepage: '65001',
      },
      // Read-only: asking again what a Low Profile resulted in cannot move
      // money, and this is the call the webhook depends on to decide whether
      // the customer was charged at all.
      { retryOnTransportFailure: true },
    )

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    // The terminal's DIGITS, not a double built from them. This read is the
    // only trusted source for what was actually charged -- the webhook compares
    // it against the order and refuses to finalize on a mismatch -- and it used
    // to go through `asNumber` and then `Math.round(x * 100)`, which is a float
    // in the middle of the money path and against the rule the rest of this
    // repo keeps. An amount this cannot read comes back null, and the webhook
    // already treats null as "do not finalize, raise the alarm".
    const amountAgorot = parseTerminalAmountAgorot(asString(raw.Amount ?? raw.amount) ?? undefined)
    const transactionId = asString(raw.InternalDealNumber ?? raw.internaldealnumber)
    const token = asString(raw.Token ?? raw.token)

    return {
      success: responseCode === 0,
      amountAgorot,
      transactionId,
      lowProfileId,
      token: token
        ? {
            token,
            last4: asString(raw.Last4CardDigits ?? raw.last4carddigits) ?? '0000',
            brand: asString(raw.CardBrand ?? raw.cardbrand) ?? 'Unknown',
            expiryMonth: asNumber(raw.CardValidityMonth ?? raw.cardvaliditymonth) ?? 1,
            expiryYear: asNumber(raw.CardValidityYear ?? raw.cardvalidityyear) ?? 2099,
          }
        : undefined,
      raw,
    }
  }
}
