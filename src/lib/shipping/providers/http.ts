import { agorot, agorotToIls } from '@/lib/money'
import { type CarrierId, carrierEntry } from '@/lib/shipping/carrier-registry'
import type { CarrierCredentials } from '@/lib/shipping/env'
import {
  CarrierError,
  type CarrierProvider,
  type CarrierQuote,
  type CreateLabelRequest,
  type CreatedLabel,
  type QuoteRequest,
  type TrackingEvent,
  type TrackingResult,
} from '@/lib/shipping/providers/types'
import { normalizeCarrierStatus } from '@/lib/shipping/tracking'
import { z } from 'zod'

/**
 * JSON-over-HTTPS adapter, one instance per configured carrier.
 *
 * THE WIRE SHAPE BELOW IS A CONTRACT WE WROTE, NOT ONE WE MEASURED. On
 * 2026-10-08 none of Israel Post, Chita or Yamit has given this project an
 * account, and none publishes a developer reference: Israel Post issues keys
 * by email against a whitelisted IP, Chita's only public trace is a PHP
 * client (create / label / cancel), Yamit integrates through "YDM" partner
 * apps. So this file defines the SMALLEST shape a courier integration needs
 * (three endpoints, a bearer key, snake_case JSON, shekels with two decimals
 * converted to agorot at this boundary) and the environment points it at a
 * base URL. The day a real contract arrives, what changes is the three
 * `parse*` functions and the three paths, and nothing above this module.
 *
 * Until then the adapter is unreachable in every environment: `loadShippingEnv`
 * selects the mock unless `<PREFIX>_API_BASE_URL` and `<PREFIX>_API_KEY` are
 * both set, and nothing sets them. Every call has a timeout; every failure is
 * a typed `CarrierError` the caller degrades from (manual tracking entry at
 * the admin, a zero-rate option at checkout) and never a 500 to the shopper.
 *
 * Secrets are never logged and never stored: `raw` on the result is the
 * parsed body, which carries the carrier's answer and not our key.
 */

/** Shekels with up to two decimals, as number or string, into integer agorot. The only arithmetic in this module. */
const moneyIls = z
  .union([z.number(), z.string()])
  .transform((v, ctx): number => {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bad amount' })
      return z.NEVER
    }
    return Math.round(n * 100)
  })
  .pipe(z.number().int().min(0))

const quoteResponseSchema = z.object({
  quotes: z.array(
    z.object({
      service_code: z.string().min(1),
      price_ils: moneyIls,
      min_days: z.number().int().min(0).optional(),
      max_days: z.number().int().min(0).optional(),
      quote_ref: z.string().nullable().optional(),
    }),
  ),
})

const labelResponseSchema = z.object({
  tracking_number: z.string().min(1),
  shipment_id: z.union([z.string(), z.number()]).nullable().optional(),
  label_pdf_base64: z.string().nullable().optional(),
  price_ils: moneyIls.nullable().optional(),
})

const trackingResponseSchema = z.object({
  tracking_number: z.string().min(1).optional(),
  status: z.string().nullable().optional(),
  estimated_delivery: z.string().nullable().optional(),
  events: z
    .array(
      z.object({
        at: z.string().min(1),
        status: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
      }),
    )
    .optional(),
})

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export class HttpCarrierProvider implements CarrierProvider {
  readonly kind = 'http' as const
  readonly carrierId: CarrierId
  private readonly credentials: CarrierCredentials
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike

  constructor(
    carrierId: CarrierId,
    credentials: CarrierCredentials,
    timeoutMs: number,
    fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.carrierId = carrierId
    this.credentials = credentials
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.credentials.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.credentials.accountId ? { 'X-Account-Id': this.credentials.accountId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: 'no-store',
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new CarrierError(
        this.carrierId,
        timedOut ? 'timeout' : 'network',
        timedOut ? `carrier call exceeded ${this.timeoutMs}ms` : 'carrier unreachable',
      )
    }
    if (response.status === 401 || response.status === 403) {
      throw new CarrierError(
        this.carrierId,
        'auth',
        `carrier refused credentials (${response.status})`,
      )
    }
    if (!response.ok) {
      throw new CarrierError(this.carrierId, 'rejected', `carrier answered ${response.status}`)
    }
    try {
      return await response.json()
    } catch {
      throw new CarrierError(this.carrierId, 'malformed', 'carrier body is not JSON')
    }
  }

  // Typed on the schema, not on `ZodType<T>`: with the latter TS unifies T
  // against both the output and the input slot and the transformed money
  // fields come back as `string | number`.
  private parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new CarrierError(
        this.carrierId,
        'malformed',
        'carrier body does not match the contract',
      )
    }
    return parsed.data
  }

  async quote(request: QuoteRequest): Promise<CarrierQuote[]> {
    const entry = carrierEntry(this.carrierId)
    const body = await this.call('POST', '/v1/quotes', {
      destination: { city: request.destination.city, zip: request.destination.zip },
      parcel: {
        weight_grams: request.parcel.weightGrams,
        declared_value_ils: agorotToIls(request.parcel.declaredValueAgorot),
        pieces: request.parcel.pieces,
      },
    })
    const parsed = this.parse(quoteResponseSchema, body)
    return parsed.quotes
      .filter((q) => entry.services.some((s) => s.code === q.service_code))
      .map((q) => {
        const service = entry.services.find((s) => s.code === q.service_code)
        return {
          carrierId: this.carrierId,
          serviceCode: q.service_code,
          carrierCostAgorot: agorot(q.price_ils),
          minDays: q.min_days ?? service?.minDays ?? 3,
          maxDays: q.max_days ?? service?.maxDays ?? 7,
          quoteRef: q.quote_ref ?? null,
        }
      })
  }

  async createLabel(request: CreateLabelRequest): Promise<CreatedLabel> {
    const d = request.destination
    const body = await this.call('POST', '/v1/shipments', {
      service_code: request.serviceCode,
      reference: request.orderRef,
      external_id: request.orderId,
      quote_ref: request.quoteRef,
      recipient: {
        name: d.fullName,
        phone: d.phone,
        city: d.city,
        street: d.street,
        house_number: d.streetNumber,
        apartment: d.apartment,
        floor: d.floor,
        entrance: d.entrance,
        zip: d.zip,
        notes: d.notes,
      },
      parcel: {
        weight_grams: request.parcel.weightGrams,
        declared_value_ils: agorotToIls(request.parcel.declaredValueAgorot),
        pieces: request.parcel.pieces,
      },
      label_format: 'pdf_a6',
    })
    const parsed = this.parse(labelResponseSchema, body)
    let labelPdf: Uint8Array | null = null
    if (parsed.label_pdf_base64) {
      try {
        labelPdf = new Uint8Array(Buffer.from(parsed.label_pdf_base64, 'base64'))
      } catch {
        labelPdf = null
      }
    }
    return {
      carrierId: this.carrierId,
      serviceCode: request.serviceCode,
      trackingNumber: parsed.tracking_number,
      providerShipmentId:
        parsed.shipment_id === null || parsed.shipment_id === undefined
          ? null
          : String(parsed.shipment_id),
      labelPdf,
      carrierCostAgorot:
        parsed.price_ils === null || parsed.price_ils === undefined
          ? null
          : agorot(parsed.price_ils),
      raw: { ...parsed, label_pdf_base64: parsed.label_pdf_base64 ? '[pdf]' : null },
    }
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    const body = await this.call(
      'GET',
      `/v1/shipments/${encodeURIComponent(trackingNumber)}/tracking`,
    )
    const parsed = this.parse(trackingResponseSchema, body)
    const events: TrackingEvent[] = (parsed.events ?? []).map((e) => ({
      at: e.at,
      status: normalizeCarrierStatus(e.status ?? e.description),
      description: e.description?.trim() || normalizeCarrierStatus(e.status),
      location: e.location?.trim() || null,
    }))
    const status = parsed.status
      ? normalizeCarrierStatus(parsed.status)
      : (events[0]?.status ?? 'in_transit')
    return {
      carrierId: this.carrierId,
      trackingNumber: parsed.tracking_number ?? trackingNumber,
      status,
      events: events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
      estimatedDelivery: parsed.estimated_delivery ?? null,
      raw: parsed,
    }
  }

  async cancel(providerShipmentId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.call('POST', `/v1/shipments/${encodeURIComponent(providerShipmentId)}/cancel`)
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'unknown' }
    }
  }
}
