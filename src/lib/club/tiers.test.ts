import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import { clubStanding } from './tiers'

describe('clubStanding', () => {
  it('starts at bronze with nothing spent', () => {
    const s = clubStanding(agorot(0))
    expect(s.current.code).toBe('bronze')
    expect(s.next?.code).toBe('silver')
    expect(s.remainingAgorot).toBe(200_000)
    expect(s.progressPercent).toBe(0)
  })
  it('promotes exactly at the threshold', () => {
    expect(clubStanding(agorot(199_999)).current.code).toBe('bronze')
    expect(clubStanding(agorot(200_000)).current.code).toBe('silver')
  })
  it('computes integer progress', () => {
    expect(clubStanding(agorot(350_000)).progressPercent).toBe(50)
  })
  it('caps at gold', () => {
    const s = clubStanding(agorot(900_000))
    expect(s.current.code).toBe('gold')
    expect(s.next).toBeNull()
    expect(s.progressPercent).toBe(100)
  })
})
