import { z } from 'zod'

/**
 * The tasks the Cloudflare Worker accepts. Shared by the Next side
 * (`async-offload.ts`, the producer) and the Worker itself
 * (`infra/cloudflare/workers/async-offload`), which imports this file by
 * relative path, so the two can never disagree about the shape.
 *
 * NO `@/` IMPORTS IN THIS FILE OR ITS SIBLINGS: wrangler bundles the Worker
 * from the repository root without Next's path alias.
 */

const httpsUrl = z
  .string()
  .url()
  .regex(/^https:\/\//, 'https only')

export const offloadTaskSchema = z.discriminatedUnion('type', [
  /** GET each URL once, so the next visitor finds a warm cache. */
  z.object({
    type: z.literal('warm-urls'),
    urls: z.array(httpsUrl).min(1).max(100),
  }),
  /** POST one body to many receivers; each receiver is retried on its own. */
  z.object({
    type: z.literal('webhook-fanout'),
    targets: z
      .array(
        z.object({
          url: httpsUrl,
          body: z.string().max(64_000),
          headers: z.record(z.string()).optional(),
        }),
      )
      .min(1)
      .max(50),
  }),
])

export type OffloadTask = z.infer<typeof offloadTaskSchema>

/** What the Worker answers when it has queued a task. */
export type OffloadAccepted = { ok: true; queued: true; type: OffloadTask['type'] }
