'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Get flagged orders pending review
 */
export async function getFlaggedOrders(
  status: 'pending' | 'approved' | 'rejected' | 'manual_review' = 'pending',
  limit = 50,
  offset = 0,
) {
  const client = await createClient()

  // Get authenticated user
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  // Verify user is an admin
  const { data: flags, error } =
    await // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
    (
      client.from('fraud_flags' as any).select(
        `
      id,
      order_id,
      profile_id,
      risk_level,
      signal_count,
      total_signal_score,
      primary_signals,
      status,
      created_at,
      orders!inner(id, amount_ils, created_at),
      fraud_signals!inner(id, signal_type, severity, metadata)
    `,
      ) as any
    )
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

  if (error) {
    return { error: `Failed to fetch flagged orders: ${error.message}` }
  }

  return { data: flags }
}

/**
 * Get details for a single flagged order
 */
export async function getFlaggedOrderDetails(flagId: string) {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data: flag, error } =
    await // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
    (
      client.from('fraud_flags' as any).select(
        `
      id,
      order_id,
      profile_id,
      risk_level,
      signal_count,
      total_signal_score,
      primary_signals,
      status,
      reviewed_by,
      reviewed_at,
      review_notes,
      action,
      action_applied_at,
      created_at,
      orders(
        id,
        profile_id,
        amount_ils,
        status,
        created_at,
        order_items(quantity, unit_price_ils, product_id)
      ),
      fraud_signals(
        id,
        signal_type,
        severity,
        signal_score,
        metadata,
        detected_at
      )
    `,
      ) as any
    )
      .eq('id', flagId)
      .single()

  if (error) {
    return { error: `Failed to fetch flag details: ${error.message}` }
  }

  return { data: flag }
}

/**
 * Approve a flagged order (reviewer decision: fraud cleared)
 */
export async function approveFlaggedOrder(flagId: string, notes = '') {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data: flag, error: updateError } = await (client
    // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
    .from('fraud_flags' as any)
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .select()
    .single() as any)

  if (updateError) {
    return { error: `Failed to approve flag: ${updateError.message}` }
  }

  return { data: flag, success: true }
}

/**
 * Reject a flagged order (reviewer decision: fraud confirmed)
 */
export async function rejectFlaggedOrder(
  flagId: string,
  action: 'hold' | 'cancel' | 'require_verification' = 'hold',
  notes = '',
) {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data: flag, error: updateError } = await (client
    // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
    .from('fraud_flags' as any)
    .update({
      status: 'rejected',
      action,
      action_applied_at: new Date().toISOString(),
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .select()
    .single() as any)

  if (updateError) {
    return { error: `Failed to reject flag: ${updateError.message}` }
  }

  // If action is cancel, update order status
  if (action === 'cancel' && flag?.order_id) {
    const { error: orderError } = await client
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', flag.order_id)

    if (orderError) {
      console.error(`Failed to cancel order ${flag.order_id}:`, orderError)
    }
  }

  return { data: flag, success: true }
}

/**
 * Mark a flagged order for manual review
 */
export async function requestManualReview(flagId: string, notes = '') {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const { data: flag, error: updateError } = await (client
    // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
    .from('fraud_flags' as any)
    .update({
      status: 'manual_review',
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', flagId)
    .select()
    .single() as any)

  if (updateError) {
    return { error: `Failed to request manual review: ${updateError.message}` }
  }

  return { data: flag, success: true }
}

/**
 * Get fraud statistics for the dashboard
 */
export async function getFraudStatistics() {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Get counts by status
  // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
  const { data: statusCounts, error: statusError } = await (client
    .from('fraud_flags' as any)
    .select('status', { count: 'exact' })
    .gt('created_at', last24h) as any)

  // Get counts by risk level
  // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
  const { data: riskCounts, error: riskError } = await (client
    .from('fraud_flags' as any)
    .select('risk_level', { count: 'exact' })
    .gt('created_at', last24h) as any)

  // Get top signal types
  // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
  const { data: topSignals, error: signalsError } = await (client
    .from('fraud_signals' as any)
    .select('signal_type', { count: 'exact' })
    .gt('detected_at', last24h)
    .order('signal_type') as any)

  if (statusError || riskError || signalsError) {
    return { error: 'Failed to fetch statistics' }
  }

  return {
    data: {
      statusCounts: statusCounts || [],
      riskCounts: riskCounts || [],
      topSignals: topSignals || [],
      period: '24h',
    },
  }
}

/**
 * Get chargeback history for a profile
 */
export async function getProfileChargebackHistory(profileId: string) {
  const client = await createClient()

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return { error: 'Not authenticated' }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Fraud tables don't exist in current types
  const { data: chargebacks, error } = await (client
    .from('chargeback_history' as any)
    .select('*')
    .eq('profile_id', profileId)
    .order('chargeback_date', { ascending: false }) as any)

  if (error) {
    return { error: `Failed to fetch chargeback history: ${error.message}` }
  }

  return { data: chargebacks }
}
