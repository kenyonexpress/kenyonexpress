import { describe, expect, it } from 'vitest'
import {
  SALES_MILESTONES,
  checkMilestone,
  getAchievedMilestones,
  getNextMilestone,
} from '../sales-tracker'

describe('checkMilestone', () => {
  const milestone = SALES_MILESTONES[0]! // Meta WhatsApp at 10

  it('returns not achieved when below threshold', () => {
    const status = checkMilestone(milestone, 5)
    expect(status.achieved).toBe(false)
    expect(status.remaining).toBe(5)
  })

  it('returns achieved when at threshold', () => {
    const status = checkMilestone(milestone, 10)
    expect(status.achieved).toBe(true)
    expect(status.remaining).toBe(0)
  })

  it('returns achieved when above threshold', () => {
    const status = checkMilestone(milestone, 25)
    expect(status.achieved).toBe(true)
    expect(status.remaining).toBe(0)
  })
})

describe('getAchievedMilestones', () => {
  it('returns empty array when no milestones achieved', () => {
    expect(getAchievedMilestones(0)).toEqual([])
    expect(getAchievedMilestones(5)).toEqual([])
  })

  it('returns first two milestones at 10 sales', () => {
    const achieved = getAchievedMilestones(10)
    expect(achieved).toHaveLength(2)
    expect(achieved[0]?.name).toBe('meta_whatsapp_verification')
    expect(achieved[1]?.name).toBe('lawyer_review')
  })

  it('returns all milestones at 50 sales', () => {
    const achieved = getAchievedMilestones(50)
    expect(achieved).toHaveLength(3)
  })
})

describe('getNextMilestone', () => {
  it('returns first milestone when starting', () => {
    const next = getNextMilestone(0)
    expect(next?.milestone.name).toBe('meta_whatsapp_verification')
    expect(next?.remaining).toBe(10)
  })

  it('returns native app milestone after 10 sales', () => {
    const next = getNextMilestone(15)
    expect(next?.milestone.name).toBe('native_app_evaluation')
    expect(next?.remaining).toBe(35)
  })

  it('returns null when all milestones achieved', () => {
    const next = getNextMilestone(100)
    expect(next).toBeNull()
  })
})
