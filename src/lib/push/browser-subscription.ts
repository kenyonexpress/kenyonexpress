import { z } from 'zod'

/**
 * The PushSubscription JSON a browser hands over (`subscription.toJSON()`).
 * The endpoint must be https (the table's own CHECK says so too) and the two
 * keys are base64url; nothing else from the browser is stored.
 */
export const browserSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith('https://'),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  }),
})

export type BrowserSubscriptionInput = z.infer<typeof browserSubscriptionSchema>
