import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createClient> | null = null

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
  }
  return supabase
}

export interface FraudSignal {
  orderId: string
  profileId: string | null
  signalType:
    | 'impossible_geography'
    | 'velocity_abuse'
    | 'chargeback_risk'
    | 'new_profile_high_value'
    | 'vpn_proxy_detected'
  severity: 'low' | 'medium' | 'high' | 'critical'
  score: number
  userIp?: string
  userLocationCountry?: string
  userLocationCity?: string
  deliveryCountry?: string
  deliveryCity?: string
  metadata?: Record<string, unknown>
}

interface OrderData {
  id: string
  profileId: string | null
  amount: number
  userIp?: string
  userLocationCountry?: string
  userLocationCity?: string
  deliveryCountry?: string
  deliveryCity?: string
  deliveryCountryCode?: string
  createdAt: Date
}

interface ProfileData {
  id: string
  createdAt: Date | string
  metadata?: Record<string, unknown>
}

/**
 * Detect impossible geography: user location incompatible with delivery address
 * Uses GeoIP data and checks if distance/time is physically impossible
 */
export async function detectImpossibleGeography(
  order: OrderData,
  userLocationCountry?: string,
): Promise<FraudSignal | null> {
  // Skip if we don't have delivery location
  if (!order.deliveryCountry || !userLocationCountry) {
    return null
  }

  // Different countries is a signal (not always fraud, but worth investigating)
  if (userLocationCountry !== order.deliveryCountry) {
    // Check if this is a legitimate international order pattern
    // For now, flag high-value cross-border orders
    if (order.amount > 50000) {
      // 500₪+ order from different country
      return {
        orderId: order.id,
        profileId: order.profileId,
        signalType: 'impossible_geography',
        severity: 'medium',
        score: 0.65,
        userIp: order.userIp,
        userLocationCountry,
        userLocationCity: undefined,
        deliveryCountry: order.deliveryCountry,
        deliveryCity: order.deliveryCity,
        metadata: {
          reason: 'cross_border_high_value',
          userCountry: userLocationCountry,
          deliveryCountry: order.deliveryCountry,
        },
      }
    }
  }

  return null
}

/**
 * Detect velocity abuse: multiple orders from same profile/IP too quickly
 */
export async function detectVelocityAbuse(
  order: OrderData,
  recentOrderCount: number,
): Promise<FraudSignal | null> {
  // More than 5 orders in 24 hours is suspicious
  if (recentOrderCount > 5) {
    const severity = recentOrderCount > 10 ? 'critical' : recentOrderCount > 8 ? 'high' : 'medium'
    const score = Math.min(1.0, 0.6 + (recentOrderCount - 5) * 0.05)

    return {
      orderId: order.id,
      profileId: order.profileId,
      signalType: 'velocity_abuse',
      severity,
      score,
      userIp: order.userIp,
      metadata: {
        reason: 'high_order_frequency',
        orderCountIn24h: recentOrderCount,
        threshold: 5,
      },
    }
  }

  return null
}

/**
 * Detect chargeback risk: orders from profiles with chargeback history
 */
export async function detectChargebackRisk(
  order: OrderData,
  recentChargebackCount: number,
): Promise<FraudSignal | null> {
  if (recentChargebackCount === 0) {
    return null
  }

  const severity =
    recentChargebackCount > 3 ? 'critical' : recentChargebackCount > 2 ? 'high' : 'medium'
  const score = Math.min(1.0, 0.5 + recentChargebackCount * 0.2)

  return {
    orderId: order.id,
    profileId: order.profileId,
    signalType: 'chargeback_risk',
    severity,
    score,
    metadata: {
      reason: 'profile_chargeback_history',
      recentChargebackCount,
      threshold: 1,
    },
  }
}

/**
 * Detect new profile with high-value order
 */
export async function detectNewProfileHighValue(
  order: OrderData,
  profile: ProfileData,
  threshold = 50000,
): Promise<FraudSignal | null> {
  if (!profile) {
    return null
  }

  const createdAtDate =
    typeof profile.createdAt === 'string' ? new Date(profile.createdAt) : profile.createdAt
  const accountAgeMs = Date.now() - createdAtDate.getTime()
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24)

  // Account less than 24 hours old with high-value order
  if (accountAgeDays < 1 && order.amount > threshold) {
    return {
      orderId: order.id,
      profileId: order.profileId,
      signalType: 'new_profile_high_value',
      severity: 'high',
      score: 0.75,
      metadata: {
        reason: 'new_account_high_transaction',
        accountAgeHours: Math.round(accountAgeMs / (1000 * 60 * 60)),
        orderAmount: order.amount,
        threshold,
      },
    }
  }

  return null
}

/**
 * Detect VPN/proxy usage based on IP reputation
 * In production, this would integrate with a GeoIP/reputation service
 */
export async function detectVpnProxyUsage(
  order: OrderData,
  _userLocationCountry?: string,
): Promise<FraudSignal | null> {
  // Placeholder for VPN detection - would integrate with IP reputation service
  // For now, always return null (not implemented)
  return null
}

/**
 * Run complete fraud detection on an order
 */
export async function detectFraudSignals(order: OrderData): Promise<FraudSignal[]> {
  const signals: FraudSignal[] = []

  // Fetch profile data if we have a profile_id
  let profile: ProfileData | null = null
  if (order.profileId) {
    const client = getSupabaseClient()!
    // biome-ignore lint/suspicious/noExplicitAny: Profiles table is valid but not in fraud context
    const { data } = await (client
      .from('profiles')
      .select('id, created_at')
      .eq('id', order.profileId)
      .single() as any)

    if (data) {
      profile = {
        id: data.id,
        createdAt: new Date(data.created_at),
      }
    }
  }

  // Check for recent orders (velocity)
  let recentOrderCount = 0
  if (order.profileId) {
    try {
      const client = getSupabaseClient()!
      // biome-ignore lint/suspicious/noExplicitAny: RPC functions don't exist in generated types
      const count = await ((client as any).rpc('fn_profile_order_velocity', {
        p_profile_id: order.profileId,
        p_hours: 24,
      }) as any)
      if (count.data !== null && typeof count.data === 'number') {
        recentOrderCount = count.data
      }
    } catch {
      // RPC function not available yet
    }
  }

  // Check for chargebacks
  let recentChargebackCount = 0
  if (order.profileId) {
    try {
      const client = getSupabaseClient()!
      // biome-ignore lint/suspicious/noExplicitAny: RPC functions don't exist in generated types
      const count = await ((client as any).rpc('fn_profile_recent_chargebacks', {
        p_profile_id: order.profileId,
        p_days: 90,
      }) as any)
      if (count.data !== null && typeof count.data === 'number') {
        recentChargebackCount = count.data
      }
    } catch {
      // RPC function not available yet
    }
  }

  // Geometry detection (if we had GeoIP data)
  const geoSignal = await detectImpossibleGeography(order, order.userLocationCountry)
  if (geoSignal) {
    signals.push(geoSignal)
  }

  // Velocity detection
  const velocitySignal = await detectVelocityAbuse(order, recentOrderCount)
  if (velocitySignal) {
    signals.push(velocitySignal)
  }

  // Chargeback risk detection
  const chargebackSignal = await detectChargebackRisk(order, recentChargebackCount)
  if (chargebackSignal) {
    signals.push(chargebackSignal)
  }

  // New profile high value detection
  if (profile) {
    const newProfileSignal = await detectNewProfileHighValue(order, profile)
    if (newProfileSignal) {
      signals.push(newProfileSignal)
    }
  }

  // VPN detection
  const vpnSignal = await detectVpnProxyUsage(order, order.userLocationCountry)
  if (vpnSignal) {
    signals.push(vpnSignal)
  }

  return signals
}

/**
 * Calculate combined fraud risk score (0-1)
 */
export function calculateCombinedRiskScore(signals: FraudSignal[]): number {
  if (signals.length === 0) {
    return 0
  }

  // Sum of individual scores, capped at 1.0
  const sum = signals.reduce((acc, signal) => acc + signal.score, 0)
  return Math.min(1.0, sum)
}

/**
 * Determine if order should be auto-flagged
 */
export function shouldAutoFlag(signals: FraudSignal[]): boolean {
  const combinedScore = calculateCombinedRiskScore(signals)

  // Auto-flag if combined score >= 0.60 (medium-high risk)
  if (combinedScore >= 0.6) {
    return true
  }

  // Also auto-flag if any single signal is critical
  return signals.some((s) => s.severity === 'critical')
}

/**
 * Determine risk level from signals
 */
export function determineRiskLevel(signals: FraudSignal[]): 'low' | 'medium' | 'high' | 'critical' {
  if (signals.length === 0) {
    return 'low'
  }

  // Check for any critical signals
  if (signals.some((s) => s.severity === 'critical')) {
    return 'critical'
  }

  // Check for multiple high severity signals
  const highCount = signals.filter((s) => s.severity === 'high').length
  if (highCount >= 2) {
    return 'high'
  }

  if (signals.some((s) => s.severity === 'high')) {
    return 'high'
  }

  // Multiple medium signals = medium risk
  if (signals.length >= 2) {
    return 'medium'
  }

  return 'medium'
}
