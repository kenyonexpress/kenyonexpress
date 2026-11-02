import { z } from 'zod'
import { CLIENT_EVENT_NAMES, MAX_BATCH_SIZE, PROPS_MAX_BYTES } from './event-names'

export * from './event-names'

const utmSchema = z
  .object({
    utm_source: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
  })
  .strict()

export type Utm = z.infer<typeof utmSchema>

// props is deliberately loose (jsonb on the other side) but never free-form: it
// must be a flat-ish object, size-capped, and PII-free by convention. The 4KB
// cap here mirrors the ingest function so an oversized event is rejected before
// it costs a database round-trip.
const propsSchema = z
  .record(z.string(), z.unknown())
  .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= PROPS_MAX_BYTES, {
    message: 'props exceeds 4KB',
  })

const clientEventSchema = z.object({
  event_id: z.string().uuid(),
  event_name: z.enum(CLIENT_EVENT_NAMES),
  occurred_at: z.string().datetime({ offset: true }),
  source: z.enum(['web', 'pwa']).default('web'),
  source_app: z.literal('shop').default('shop'),
  session_id: z.string().min(1).max(64),
  path: z.string().max(300).optional(),
  referrer: z.string().max(600).optional(),
  utm: utmSchema.optional(),
  props: propsSchema.default({}),
})

export type ClientEvent = z.infer<typeof clientEventSchema>

export const ingestBatchSchema = z.object({
  events: z.array(clientEventSchema).min(1).max(MAX_BATCH_SIZE),
})
