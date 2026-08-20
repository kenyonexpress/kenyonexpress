import { describe, expect, it } from 'vitest'
import { maskUserId } from './mask'

const A = '3f2a1b7c-9d4e-4f80-8a1b-2c3d4e5f6071'
const B = '9c8b7a65-4321-4def-9876-543210fedcba'

describe('maskUserId', () => {
  it('is stable, so two lines an hour apart are recognisably one person', () => {
    expect(maskUserId(A)).toBe(maskUserId(A))
  })

  it('separates two users', () => {
    expect(maskUserId(A)).not.toBe(maskUserId(B))
  })

  it('contains no part of the id it masks', () => {
    // The failure this guards against is "masking" by truncation: the first
    // eight characters of a uuid find the row with LIKE '3f2a1b7c%', so the
    // drain still holds a working handle to the account.
    const masked = maskUserId(A) as string
    expect(masked).not.toContain(A)
    for (const segment of A.split('-')) {
      expect(masked).not.toContain(segment)
    }
  })

  it('is prefixed, so nobody pastes it into a where clause', () => {
    expect(maskUserId(A)).toMatch(/^u_[0-9a-f]{16}$/)
  })

  it('is null for an anonymous request rather than a hash of nothing', () => {
    // Otherwise every logged-out visitor is the same person, and a drain
    // grouping by this field reports one very busy user.
    expect(maskUserId(null)).toBeNull()
    expect(maskUserId(undefined)).toBeNull()
    expect(maskUserId('')).toBeNull()
  })

  it('does not collide across a realistic id set', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 5000; index++) {
      seen.add(maskUserId(`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) as string)
    }
    expect(seen.size).toBe(5000)
  })
})
