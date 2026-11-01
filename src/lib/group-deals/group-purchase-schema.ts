/**
 * Group deals / bulk purchase discount schema.
 * BACKLOG Item 1: Group-deals re-evaluation, 2026-10-23.
 *
 * Implements tiered discounts for bulk/group purchases.
 * Users can create or join group purchases to unlock volume discounts.
 */

import { z } from 'zod'

export const groupDealStatusSchema = z.enum(['active', 'completed', 'cancelled', 'expired'])

export type GroupDealStatus = z.infer<typeof groupDealStatusSchema>

const discountTierSchema = z.object({
  minQuantity: z.number().int().positive(),
  discountPercent: z.number().min(0).max(100),
})

export type DiscountTier = z.infer<typeof discountTierSchema>

export const createGroupDealSchema = z.object({
  productId: z.string().uuid(),
  tiers: z.array(discountTierSchema).min(1),
  maxParticipants: z.number().int().positive().max(1000),
  expiresAt: z.date(),
})

export type CreateGroupDeal = z.infer<typeof createGroupDealSchema>

export const groupDealSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  organizerId: z.string().uuid(),
  tiers: z.array(discountTierSchema),
  currentParticipants: z.number().int().min(0),
  maxParticipants: z.number().int().positive(),
  status: groupDealStatusSchema,
  expiresAt: z.date(),
  createdAt: z.date(),
})

export type GroupDeal = z.infer<typeof groupDealSchema>

/**
 * Calculate discount for current participant count.
 */
export function calculateGroupDiscount(tiers: DiscountTier[], participantCount: number): number {
  // Find highest applicable tier
  const sortedTiers = [...tiers].sort((a, b) => b.minQuantity - a.minQuantity)

  for (const tier of sortedTiers) {
    if (participantCount >= tier.minQuantity) {
      return tier.discountPercent
    }
  }

  return 0
}

/**
 * Calculate discounted price in agorot.
 */
export function applyGroupDiscount(priceAgorot: number, discountPercent: number): number {
  const discountAmount = Math.round((priceAgorot * discountPercent) / 100)
  return priceAgorot - discountAmount
}

/**
 * Get next tier and how many more participants needed.
 */
export function getNextTier(
  tiers: DiscountTier[],
  currentParticipants: number,
): { tier: DiscountTier; participantsNeeded: number } | null {
  const sortedTiers = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity)

  for (const tier of sortedTiers) {
    if (currentParticipants < tier.minQuantity) {
      return {
        tier,
        participantsNeeded: tier.minQuantity - currentParticipants,
      }
    }
  }

  return null // Already at highest tier
}
