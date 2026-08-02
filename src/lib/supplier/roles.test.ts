import { describe, expect, it } from 'vitest'
import { hasMinRole, normalizeMemberRole } from './roles'

describe('normalizeMemberRole', () => {
  it('keeps known roles', () => {
    expect(normalizeMemberRole('owner')).toBe('owner')
    expect(normalizeMemberRole('manager')).toBe('manager')
    expect(normalizeMemberRole('scanner')).toBe('scanner')
  })

  it('falls back to scanner for unknown values', () => {
    expect(normalizeMemberRole('staff')).toBe('scanner')
    expect(normalizeMemberRole(null)).toBe('scanner')
  })
})

describe('hasMinRole', () => {
  it('owner satisfies every minimum', () => {
    expect(hasMinRole('owner', 'scanner')).toBe(true)
    expect(hasMinRole('owner', 'manager')).toBe(true)
    expect(hasMinRole('owner', 'owner')).toBe(true)
  })

  it('scanner cannot open owner surfaces', () => {
    expect(hasMinRole('scanner', 'owner')).toBe(false)
    expect(hasMinRole('scanner', 'manager')).toBe(false)
    expect(hasMinRole('scanner', 'scanner')).toBe(true)
  })

  it('manager can open manager but not owner', () => {
    expect(hasMinRole('manager', 'manager')).toBe(true)
    expect(hasMinRole('manager', 'owner')).toBe(false)
  })
})
