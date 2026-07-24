import { agorot } from '@/lib/commerce/money'
import { loadCardcomEnv } from '@/lib/payments/env'
import type {
  ChargeWithTokenInput,
  ChargeWithTokenResult,
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
 * Cardcom Low Profile HTTP adapter.
 * Amounts are sent as ILS with 2 decimals (Cardcom convention); we convert from agorot at the boundary.
 */
export class CardcomProvider implements PaymentProvider {
  readonly name = 'cardcom' as const

  private get env() {
    return loadCardcomEnv()
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
    const env = this.env
    const raw = await this.postForm('/Interface/LowProfile.aspx', {
      TerminalNumber: env.terminalNumber,
      ApiName: env.apiName,
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
    const env = this.env
    const raw = await this.postForm('/Interface/ChargeToken.aspx', {
      TerminalNumber: env.terminalNumber,
      ApiName: env.apiName,
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
    const env = this.env
    const amountAgorot = input.partialAmountAgorot ?? input.amountAgorot
    // Legacy credit/refund. ApiPassword is mandatory for money-moving-back calls.
    // TODO(cardcom): confirm the exact legacy refund endpoint + field names against
    // the live terminal before go-live; kept legacy to match the rest of this client.
    const raw = await this.postForm('/Interface/RefundDeal.aspx', {
      TerminalNumber: env.terminalNumber,
      ApiName: env.apiName,
      ApiPassword: env.apiPassword,
      InternalDealNumber: input.transactionId,
      Amount: this.ilsFromAgorot(amountAgorot),
      CoinId: '1',
      Codepage: '65001',
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

  async verifyLowProfile(lowProfileId: string): Promise<VerifyLowProfileResult> {
    const env = this.env
    const raw = await this.postForm('/Interface/GetLpResult.aspx', {
      TerminalNumber: env.terminalNumber,
      ApiName: env.apiName,
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
