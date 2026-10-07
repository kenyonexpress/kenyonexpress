import type { Agorot } from '@/lib/money'
import type { CarrierId } from '@/lib/shipping/carrier-registry'

/**
 * The contract every carrier adapter implements. Three verbs, nothing else:
 * quote a parcel, create a label, read tracking. Cancellation is optional
 * because Israel Post has none once an item is posted.
 *
 * Money is integer agorot throughout. A carrier that answers in shekels with
 * decimals is converted at the adapter boundary (`Math.round(x * 100)`), and
 * the conversion is the adapter's only arithmetic.
 */

export interface ParcelAddress {
  fullName: string
  phone: string | null
  city: string
  street: string
  streetNumber: string | null
  apartment: string | null
  floor: string | null
  entrance: string | null
  zip: string | null
  notes: string | null
}

export interface ParcelInput {
  /** Total weight, grams; the quote and the label both price on it. */
  weightGrams: number
  /** Declared value, agorot; insurance and customs fields derive from it. */
  declaredValueAgorot: Agorot
  /** Number of physical units, for the label's "1 of N" and the manifest. */
  pieces: number
}

export interface QuoteRequest {
  carrierId: CarrierId
  destination: Pick<ParcelAddress, 'city' | 'zip'>
  parcel: ParcelInput
}

export interface CarrierQuote {
  carrierId: CarrierId
  serviceCode: string
  /** What the courier charges the platform, agorot. */
  carrierCostAgorot: Agorot
  minDays: number
  maxDays: number
  /** The provider's own quote reference when it issues one; sent back on label creation. */
  quoteRef: string | null
}

export interface CreateLabelRequest {
  carrierId: CarrierId
  serviceCode: string
  /** Our order id; becomes the carrier's customer reference. */
  orderId: string
  /** Short human reference printed on the label. */
  orderRef: string
  destination: ParcelAddress
  parcel: ParcelInput
  quoteRef: string | null
}

export interface CreatedLabel {
  carrierId: CarrierId
  serviceCode: string
  /** The carrier's tracking number; the customer-facing identity of the parcel. */
  trackingNumber: string
  /** The carrier's own shipment id, when distinct from the tracking number. */
  providerShipmentId: string | null
  /**
   * The label as PDF bytes when the carrier returned one, or null when the
   * caller must render it (the mock, and any carrier that answers with a
   * tracking number only).
   */
  labelPdf: Uint8Array | null
  /** The courier's cost as finally billed, agorot; null when the carrier does not say. */
  carrierCostAgorot: Agorot | null
  /** The raw provider body, stored for the audit trail, secrets already stripped by the adapter. */
  raw: unknown
}

export type TrackingStatus =
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'

export interface TrackingEvent {
  /** ISO timestamp from the carrier, or the poll time when it gives none. */
  at: string
  status: TrackingStatus
  /** Hebrew, as the carrier wrote it or as the adapter mapped it. */
  description: string
  location: string | null
}

export interface TrackingResult {
  carrierId: CarrierId
  trackingNumber: string
  status: TrackingStatus
  events: TrackingEvent[]
  /** The carrier's estimated delivery date (YYYY-MM-DD) when it gives one. */
  estimatedDelivery: string | null
  raw: unknown
}

export interface CarrierProvider {
  readonly carrierId: CarrierId
  /** 'mock' or 'http'; recorded on the shipment so a reader knows which produced it. */
  readonly kind: 'mock' | 'http'
  quote(request: QuoteRequest): Promise<CarrierQuote[]>
  createLabel(request: CreateLabelRequest): Promise<CreatedLabel>
  track(trackingNumber: string): Promise<TrackingResult>
  cancel?(providerShipmentId: string): Promise<{ ok: boolean; reason?: string }>
}

/** Thrown by adapters on anything but a clean answer; the caller decides what degrades. */
export class CarrierError extends Error {
  readonly carrierId: CarrierId
  readonly kind: 'network' | 'timeout' | 'auth' | 'rejected' | 'malformed'
  constructor(carrierId: CarrierId, kind: CarrierError['kind'], message: string) {
    super(message)
    this.name = 'CarrierError'
    this.carrierId = carrierId
    this.kind = kind
  }
}
