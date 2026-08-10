import { agorot } from '@/lib/commerce/money'
import { type CardcomAccount, loadCardcomAccounts } from '@/lib/payments/accounts'
import type {
  ChargeWithTokenInput,
  ChargeWithTokenResult,
  CreateDocumentInput,
  CreateDocumentResult,
  CreateLowProfileInput,
  CreateLowProfileResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
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
export class CardcomProvider implements PaymentProvider {
  readonly name = 'cardcom' as const
  readonly account: CardcomAccount

  constructor(account?: CardcomAccount) {
    this.account = account ?? loadCardcomAccounts(process.env, { mock: false }).platform
  }

  private baseUrl(): string {
    return (
      process.env.CARDCOM_API_BASE_URL?.replace(/\/$/, '') ?? 'https://secure.cardcom.solutions'
    )
  }

  private async postForm(path: string, fields: Record<string, string>): Promise<CardcomJson> {
    const body = new URLSearchParams(fields)
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
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
    const raw = await this.postForm('/Interface/LowProfile.aspx', {
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
    })

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
    const raw = await this.postForm('/Interface/GetLpResult.aspx', {
      TerminalNumber: this.account.terminalNumber,
      ApiName: this.account.apiName,
      LowProfileCode: lowProfileId,
      Codepage: '65001',
    })

    const responseCode = asNumber(raw.ResponseCode ?? raw.responsecode) ?? -1
    const amountIls = asNumber(raw.Amount ?? raw.amount)
    const transactionId = asString(raw.InternalDealNumber ?? raw.internaldealnumber)
    const token = asString(raw.Token ?? raw.token)

    return {
      success: responseCode === 0,
      amountAgorot: amountIls != null ? agorot(Math.round(amountIls * 100)) : null,
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
