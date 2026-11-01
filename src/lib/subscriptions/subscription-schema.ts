/**
 * Course subscription billing schema and types.
 * BACKLOG Item 6: Courses monthly billing, Phase 2.
 *
 * Implements monthly recurring billing for course products.
 * Activated when courses-monthly feature flag is enabled.
 */

import { z } from 'zod'

export const subscriptionIntervalSchema = z.enum(['monthly', 'quarterly', 'annual'])

export type SubscriptionInterval = z.infer<typeof subscriptionIntervalSchema>

export const subscriptionStatusSchema = z.enum([
  'active',
  'cancelled',
  'paused',
  'expired',
  'pending_payment',
])

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

export const createSubscriptionSchema = z.object({
  productId: z.string().uuid(),
  userId: z.string().uuid(),
  interval: subscriptionIntervalSchema,
  startDate: z.date(),
  priceAgorot: z.number().int().positive(),
})

export type CreateSubscription = z.infer<typeof createSubscriptionSchema>

const subscriptionSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  userId: z.string().uuid(),
  interval: subscriptionIntervalSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  priceAgorot: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cancelledAt: z.date().nullable(),
})

export type Subscription = z.infer<typeof subscriptionSchema>

/**
 * Calculate next billing date based on interval.
 */
export function getNextBillingDate(currentPeriodEnd: Date, interval: SubscriptionInterval): Date {
  const next = new Date(currentPeriodEnd)

  switch (interval) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'annual':
      next.setFullYear(next.getFullYear() + 1)
      break
  }

  return next
}

/**
 * Check if subscription is due for renewal.
 */
export function isDueForRenewal(subscription: Subscription): boolean {
  if (subscription.status !== 'active') return false
  return new Date() >= subscription.currentPeriodEnd
}
