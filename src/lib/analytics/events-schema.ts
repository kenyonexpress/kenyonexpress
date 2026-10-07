import { z } from 'zod'
import {
  CLIENT_EVENT_NAMES,
  type ClientEvent,
  MAX_BATCH_SIZE,
  PROPS_MAX_BYTES,
  type Utm,
} from './events'

/**
 * Server-side validation of the browser's event batch (`/api/a`).
 *
 * Split out of `./events` in STEP 34 so that zod stays out of the browser
 * tracker's graph; see the note there. The two `satisfies`-style checks at the
 * bottom are the contract: if a field is added to a schema and not to the
 * hand-written type (or the other way round), `tsc` fails here.
 */

export const utmSchema = z
  .object({
    utm_source: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
  })
  .strict()

// props is deliberately loose (jsonb on the other side) but never free-form: it
// must be a flat-ish object, size-capped, and PII-free by convention. The 4KB
// cap here mirrors the ingest function so an oversized event is rejected before
// it costs a database round-trip.
const propsSchema = z
  .record(z.unknown())
  .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= PROPS_MAX_BYTES, {
    message: 'props exceeds 4KB',
  })

export const clientEventSchema = z.object({
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

export const ingestBatchSchema = z.object({
  events: z.array(clientEventSchema).min(1).max(MAX_BATCH_SIZE),
})

/*
 * Compile-time equivalence between the schemas and the hand-written types in
 * `./events`. Each pair is assignable in both directions, which for object
 * types is equality up to optional-key representation. No runtime cost: these
 * are type aliases over `never`-or-`true`.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
type UtmMatches = MutuallyAssignable<z.infer<typeof utmSchema>, Utm>
type ClientEventMatches = MutuallyAssignable<z.infer<typeof clientEventSchema>, ClientEvent>
export const SCHEMA_TYPES_MATCH: [UtmMatches, ClientEventMatches] = [true, true]
