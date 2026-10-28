/**
 * RFM (Recency, Frequency, Monetary) Analysis for customer segmentation.
 * Integrates with Supabase RPC functions for calculating metrics and assigning segments.
 */

import type { createClient } from '@supabase/supabase-js'

type SupabaseClient = ReturnType<typeof createClient>

export type CustomerSegmentType = 'champions' | 'loyal' | 'potential' | 'at_risk' | 'dormant'

export interface RFMScore {
  id: string
  user_id: string
  recency_days: number
  frequency_count: number
  monetary_total_ils: number
  last_order_at: string | null
  first_order_at: string | null
  avg_order_value_ils: number
  calculated_at: string
  updated_at: string
}

export interface CustomerSegment {
  id: string
  segment_type: CustomerSegmentType
  name_he: string
  name_en: string
  description_he: string | null
  description_en: string | null
  min_recency_days: number
  max_recency_days: number
  min_frequency_count: number
  min_monetary_total_ils: number
  is_active: boolean
  campaign_hook_enabled: boolean
  campaign_hook_description: string | null
  created_at: string
  updated_at: string
}

export interface UserSegmentTag {
  id: string
  user_id: string
  segment_id: string
  assigned_at: string
  reason: string | null
}

export interface UserSegmentInfo {
  segment_type: CustomerSegmentType
  name_he: string
  name_en: string
  description_he: string | null
  campaign_hook_enabled: boolean
}

interface SegmentUser {
  user_id: string
  email: string
  full_name: string | null
  recency_days: number
  frequency_count: number
  monetary_total_ils: number
  assigned_at: string
}

/**
 * Calculate RFM scores for all users
 * Must be run as admin or via authenticated RPC
 */
export async function calculateRFMScores(supabase: SupabaseClient) {
  const { data, error } = await (supabase as any).rpc('fn_calculate_rfm_scores')

  if (error) {
    throw new Error(`Failed to calculate RFM scores: ${error.message}`)
  }

  return data as Array<{
    user_id: string
    recency_days: number
    frequency_count: number
    monetary_total_ils: number
  }>
}

/**
 * Segment users based on RFM thresholds
 * Assigns users to their best-matching segment
 */
export async function segmentUsers(supabase: SupabaseClient) {
  const { data, error } = await (supabase as any).rpc('fn_segment_users')

  if (error) {
    throw new Error(`Failed to segment users: ${error.message}`)
  }

  return data as Array<{
    user_id: string
    segment_type: CustomerSegmentType
  }>
}

/**
 * Get segments for the current authenticated user
 */
export async function getUserSegments(supabase: SupabaseClient) {
  const { data, error } = await (supabase as any).rpc('fn_get_user_segments')

  if (error) {
    throw new Error(`Failed to get user segments: ${error.message}`)
  }

  return data as UserSegmentInfo[]
}

/**
 * Get all users in a specific segment (admin only)
 */
export async function getSegmentUsers(supabase: SupabaseClient, segmentType: CustomerSegmentType) {
  const { data, error } = await (supabase as any).rpc('fn_get_segment_users', {
    p_segment_type: segmentType,
  })

  if (error) {
    throw new Error(`Failed to get users for segment ${segmentType}: ${error.message}`)
  }

  return data as SegmentUser[]
}

/**
 * Determine segment classification based on RFM values
 * Used for display and analytics
 */
export function classifySegment(rfm: RFMScore): CustomerSegmentType {
  const r = rfm.recency_days
  const f = rfm.frequency_count
  const m = rfm.monetary_total_ils

  // Champions: high R (recent), high F, high M
  if (r <= 60 && f >= 5 && m >= 500) {
    return 'champions'
  }

  // Loyal: medium R, high F, high M
  if (r <= 90 && f >= 3 && m >= 200) {
    return 'loyal'
  }

  // Potential: high R, low F, medium M
  if (r <= 60 && f >= 1 && m >= 50) {
    return 'potential'
  }

  // At Risk: low R (not recent), low frequency
  if (r > 60 && r <= 180) {
    return 'at_risk'
  }

  // Dormant: very low R (not purchased in 180+ days)
  return 'dormant'
}

/**
 * Format RFM metrics for display
 */
export function formatRFMMetrics(rfm: RFMScore) {
  return {
    recency: `${rfm.recency_days} days`,
    frequency: `${rfm.frequency_count} orders`,
    monetary: `₪${(rfm.monetary_total_ils / 100).toFixed(2)}`,
    avgOrderValue: `₪${(rfm.avg_order_value_ils / 100).toFixed(2)}`,
    lastOrder: rfm.last_order_at ? new Date(rfm.last_order_at) : null,
  }
}

/**
 * Segment display labels in Hebrew and English
 */
export const SEGMENT_LABELS: Record<CustomerSegmentType, { he: string; en: string }> = {
  champions: {
    he: 'אלופים',
    en: 'Champions',
  },
  loyal: {
    he: 'נאמנים',
    en: 'Loyal',
  },
  potential: {
    he: 'פוטנציאליים',
    en: 'Potential',
  },
  at_risk: {
    he: 'בסכנה',
    en: 'At Risk',
  },
  dormant: {
    he: 'כלא פעילים',
    en: 'Dormant',
  },
}

/**
 * Campaign hook descriptions in Hebrew and English
 */
export const CAMPAIGN_DESCRIPTIONS: Record<CustomerSegmentType, { he: string; en: string }> = {
  champions: {
    he: 'הצעות בלעדיות, גישה מוקדמת, תגמולי נאמנות',
    en: 'Exclusive deals, early access, loyalty rewards',
  },
  loyal: {
    he: 'הנחות מיוחדות, קמפיינים של תודה, בונוסי הפניה',
    en: 'Special discounts, thank you campaigns, referral bonuses',
  },
  potential: {
    he: 'עידוד לחזרה, המלצות מוצרים חדשים',
    en: 'Encouragement to repeat, new product recommendations',
  },
  at_risk: {
    he: 'קמפיינים לעיכול מחדש, הצעות קומבק מיוחדות',
    en: 'Re-engagement campaigns, special comeback offers',
  },
  dormant: {
    he: 'קמפיינים לנצח, קידומי עונתיים',
    en: 'Win-back campaigns, seasonal promotions',
  },
}
