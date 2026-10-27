/**
 * User Verification Milestones
 * C65: Phone verification after 5 physical orders
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

export type MilestoneType =
  | 'phone_verification_after_5_orders'
  | 'address_verification_after_5_orders'

export interface UserVerificationMilestone {
  id: string
  user_id: string
  milestone_type: MilestoneType
  achieved_at: string
  verified_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Check if a specific user needs phone verification
 * Uses the database function fn_user_needs_phone_verification
 */
export async function userNeedsPhoneVerification(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()

    // Call the database function
    const { data, error } = await admin.rpc('fn_user_needs_phone_verification', {
      p_user_id: userId,
    })

    if (error) {
      log.error('milestone.check_verification_failed', { userId, error: error.message })
      return false
    }

    return data === true
  } catch (error) {
    log.error('milestone.check_verification_exception', { userId, error })
    return false
  }
}

/**
 * Get user's physical order count
 * Uses the database function fn_count_user_physical_orders
 */
export async function getUserPhysicalOrderCount(userId: string): Promise<number> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('fn_count_user_physical_orders', {
      p_user_id: userId,
    })

    if (error) {
      log.error('milestone.count_orders_failed', { userId, error: error.message })
      return 0
    }

    return typeof data === 'number' ? data : 0
  } catch (error) {
    log.error('milestone.count_orders_exception', { userId, error })
    return 0
  }
}

/**
 * Get user's verification milestone (if exists)
 */
export async function getUserVerificationMilestone(
  userId: string,
  milestoneType: MilestoneType = 'phone_verification_after_5_orders',
): Promise<UserVerificationMilestone | null> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('user_verification_milestones')
      .select('*')
      .eq('user_id', userId)
      .eq('milestone_type', milestoneType)
      .single()

    if (error) {
      // Not found is expected
      if (error.code === 'PGRST116') return null
      log.error('milestone.get_milestone_failed', { userId, milestoneType, error: error.message })
      return null
    }

    return data as UserVerificationMilestone
  } catch (error) {
    log.error('milestone.get_milestone_exception', { userId, milestoneType, error })
    return null
  }
}

/**
 * Mark a milestone as verified
 * (Called after user completes phone verification via OTP)
 */
export async function markMilestoneVerified(
  userId: string,
  milestoneType: MilestoneType = 'phone_verification_after_5_orders',
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient()

    // Get existing milestone
    const milestone = await getUserVerificationMilestone(userId, milestoneType)
    if (!milestone) {
      return { success: false, error: 'milestone_not_found' }
    }

    // Update verified_at and optionally merge metadata
    const updateData: {
      verified_at: string
      metadata?: Record<string, unknown>
    } = {
      verified_at: new Date().toISOString(),
    }

    if (metadata) {
      updateData.metadata = {
        ...milestone.metadata,
        ...metadata,
      }
    }

    const { error } = await admin
      .from('user_verification_milestones')
      .update(updateData)
      .eq('id', milestone.id)

    if (error) {
      log.error('milestone.mark_verified_failed', {
        userId,
        milestoneType,
        milestoneId: milestone.id,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    log.info('milestone.marked_verified', {
      userId,
      milestoneType,
      milestoneId: milestone.id,
    })

    return { success: true }
  } catch (error) {
    log.error('milestone.mark_verified_exception', { userId, milestoneType, error })
    return { success: false, error: 'internal_error' }
  }
}

/**
 * Manually create a verification milestone for a user
 * (For admin use or testing)
 */
export async function createVerificationMilestone(
  userId: string,
  milestoneType: MilestoneType,
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; milestone?: UserVerificationMilestone; error?: string }> {
  try {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('user_verification_milestones')
      .insert({
        user_id: userId,
        milestone_type: milestoneType,
        metadata: metadata || {},
      })
      .select()
      .single()

    if (error) {
      // Duplicate is ok (milestone already exists)
      if (error.code === '23505') {
        const existing = await getUserVerificationMilestone(userId, milestoneType)
        return { success: true, milestone: existing || undefined }
      }

      log.error('milestone.create_failed', { userId, milestoneType, error: error.message })
      return { success: false, error: error.message }
    }

    log.info('milestone.created', { userId, milestoneType, milestoneId: data.id })

    return { success: true, milestone: data as UserVerificationMilestone }
  } catch (error) {
    log.error('milestone.create_exception', { userId, milestoneType, error })
    return { success: false, error: 'internal_error' }
  }
}
