/**
 * Sales milestone tracker.
 * BACKLOG Item 3: Meta WhatsApp Business verification requires 10 sales.
 *
 * Tracks when sales milestones are reached to trigger verification processes.
 */

export interface SalesMilestone {
  name: string
  threshold: number
  description: string
}

export const SALES_MILESTONES: SalesMilestone[] = [
  {
    name: 'meta_whatsapp_verification',
    threshold: 10,
    description: 'Meta WhatsApp Business verification can be initiated',
  },
  {
    name: 'lawyer_review',
    threshold: 10,
    description: 'Legal review of ToS and Privacy Policy recommended',
  },
  {
    name: 'native_app_evaluation',
    threshold: 50,
    description: 'Evaluate native app development (Capacitor vs Expo)',
  },
]

export interface MilestoneStatus {
  milestone: SalesMilestone
  currentCount: number
  achieved: boolean
  remaining: number
}

/**
 * Check milestone status against current sales count.
 */
export function checkMilestone(
  milestone: SalesMilestone,
  currentSalesCount: number,
): MilestoneStatus {
  return {
    milestone,
    currentCount: currentSalesCount,
    achieved: currentSalesCount >= milestone.threshold,
    remaining: Math.max(0, milestone.threshold - currentSalesCount),
  }
}

/**
 * Get all achieved milestones.
 */
export function getAchievedMilestones(currentSalesCount: number): SalesMilestone[] {
  return SALES_MILESTONES.filter((m) => currentSalesCount >= m.threshold)
}

/**
 * Get next milestone to achieve.
 */
export function getNextMilestone(currentSalesCount: number): MilestoneStatus | null {
  const pending = SALES_MILESTONES.filter((m) => currentSalesCount < m.threshold)

  if (pending.length === 0) return null

  const next = pending.reduce((closest, current) =>
    current.threshold < closest.threshold ? current : closest,
  )

  return checkMilestone(next, currentSalesCount)
}
