import { agorot } from '@/lib/money'
import { type CarrierId, carrierEntry } from '@/lib/shipping/carrier-registry'
import type {
  CarrierProvider,
  CarrierQuote,
  CreateLabelRequest,
  CreatedLabel,
  QuoteRequest,
  TrackingEvent,
  TrackingResult,
  TrackingStatus,
} from '@/lib/shipping/providers/types'

/**
 * The in-process carrier. Deterministic, clock-injected, no network.
 *
 * It is the DEFAULT provider (see lib/shipping/env.ts for why) and therefore
 * the one production runs today, so it must behave like a courier and not
 * like a stub: quotes vary with weight and service, a label gets a tracking
 * number the admin can print and the customer can read, and tracking
 * advances with wall-clock time so the account timeline moves.
 *
 * The tracking number carries its own birth time (base36 minutes) so that
 * `track()` needs no store: a mock label created on one serverless instance
 * is trackable from any other, and from a test with a fixed clock.
 */

const MOCK_PREFIX = 'KEMOCK'

const CARRIER_CODE: Record<CarrierId, string> = {
  israel_post: 'IP',
  chita: 'CH',
  yamit: 'YM',
}

/** Agorot per started kilogram, by carrier; plausible Israeli list prices, not quotes anyone gave. */
const BASE_PER_KG: Record<CarrierId, number> = {
  israel_post: 1890,
  chita: 2990,
  yamit: 2790,
}

const SERVICE_MULTIPLIER_BP: Record<string, number> = {
  registered: 10_000,
  ems: 18_000,
  locker: 8_500,
  standard: 10_000,
  express: 16_000,
  pickup_point: 8_000,
}

function hash32(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mockTrackingNumber(carrierId: CarrierId, orderId: string, nowMs: number): string {
  const minutes = Math.floor(nowMs / 60_000)
    .toString(36)
    .toUpperCase()
  const suffix = hash32(`${carrierId}|${orderId}`).toString(36).toUpperCase().slice(0, 6)
  return `${MOCK_PREFIX}-${CARRIER_CODE[carrierId]}-${minutes}-${suffix}`
}

export function isMockTrackingNumber(value: string): boolean {
  return value.startsWith(`${MOCK_PREFIX}-`)
}

/** The birth time encoded in a mock number, or null for a foreign one. */
export function mockTrackingBirthMs(trackingNumber: string): number | null {
  const parts = trackingNumber.split('-')
  if (parts.length !== 4 || parts[0] !== MOCK_PREFIX) return null
  const minutes = Number.parseInt(parts[2] ?? '', 36)
  return Number.isFinite(minutes) ? minutes * 60_000 : null
}

const HOUR = 3_600_000

/** The mock parcel's journey: label, then 2h to first scan, out for delivery after 30h, delivered after 36h. */
export function mockStatusAt(elapsedMs: number): TrackingStatus {
  if (elapsedMs < 2 * HOUR) return 'label_created'
  if (elapsedMs < 30 * HOUR) return 'in_transit'
  if (elapsedMs < 36 * HOUR) return 'out_for_delivery'
  return 'delivered'
}

export class MockCarrierProvider implements CarrierProvider {
  readonly kind = 'mock' as const
  readonly carrierId: CarrierId
  private readonly now: () => number

  constructor(carrierId: CarrierId, now: () => number = () => Date.now()) {
    this.carrierId = carrierId
    this.now = now
  }

  async quote(request: QuoteRequest): Promise<CarrierQuote[]> {
    const entry = carrierEntry(this.carrierId)
    const kg = Math.max(1, Math.ceil(request.parcel.weightGrams / 1000))
    if (request.parcel.weightGrams > entry.maxWeightGrams) return []
    const base = BASE_PER_KG[this.carrierId] * kg
    return entry.services.map((service) => {
      const bp = SERVICE_MULTIPLIER_BP[service.code] ?? 10_000
      // Integer agorot: basis points over ten thousand, rounded half up.
      const cost = Math.floor((base * bp + 5000) / 10_000)
      return {
        carrierId: this.carrierId,
        serviceCode: service.code,
        carrierCostAgorot: agorot(cost),
        minDays: service.minDays,
        maxDays: service.maxDays,
        quoteRef: `mock-q-${hash32(`${this.carrierId}|${service.code}|${kg}`).toString(36)}`,
      }
    })
  }

  async createLabel(request: CreateLabelRequest): Promise<CreatedLabel> {
    const nowMs = this.now()
    const trackingNumber = mockTrackingNumber(this.carrierId, request.orderId, nowMs)
    const [quote] = (
      await this.quote({
        carrierId: this.carrierId,
        destination: { city: request.destination.city, zip: request.destination.zip },
        parcel: request.parcel,
      })
    ).filter((q) => q.serviceCode === request.serviceCode)
    return {
      carrierId: this.carrierId,
      serviceCode: request.serviceCode,
      trackingNumber,
      providerShipmentId: null,
      labelPdf: null,
      carrierCostAgorot: quote?.carrierCostAgorot ?? null,
      raw: { provider: 'mock', created_at: new Date(nowMs).toISOString() },
    }
  }

  async track(trackingNumber: string): Promise<TrackingResult> {
    const birth = mockTrackingBirthMs(trackingNumber)
    const nowMs = this.now()
    if (birth === null) {
      return {
        carrierId: this.carrierId,
        trackingNumber,
        status: 'in_transit',
        events: [],
        estimatedDelivery: null,
        raw: { provider: 'mock', unknown: true },
      }
    }
    const elapsed = nowMs - birth
    const status = mockStatusAt(elapsed)
    const stamp = (offsetMs: number) => new Date(birth + offsetMs).toISOString()
    const events: TrackingEvent[] = [
      { at: stamp(0), status: 'label_created', description: 'תווית נוצרה', location: null },
    ]
    if (elapsed >= 2 * HOUR) {
      events.push({
        at: stamp(2 * HOUR),
        status: 'in_transit',
        description: 'נאסף מהשולח',
        location: 'מרכז מיון',
      })
    }
    if (elapsed >= 30 * HOUR) {
      events.push({
        at: stamp(30 * HOUR),
        status: 'out_for_delivery',
        description: 'יצא לחלוקה',
        location: null,
      })
    }
    if (elapsed >= 36 * HOUR) {
      events.push({
        at: stamp(36 * HOUR),
        status: 'delivered',
        description: 'נמסר לנמען',
        location: null,
      })
    }
    const eta = new Date(birth + 36 * HOUR).toISOString().slice(0, 10)
    return {
      carrierId: this.carrierId,
      trackingNumber,
      status,
      events: events.reverse(),
      estimatedDelivery: status === 'delivered' ? null : eta,
      raw: { provider: 'mock', elapsed_ms: elapsed },
    }
  }

  async cancel(): Promise<{ ok: boolean; reason?: string }> {
    return { ok: true }
  }
}
