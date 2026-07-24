import { describe, expect, it } from 'vitest'
import {
  type AdminSection,
  assignableRoles,
  canAssignRole,
  canReadSection,
  canSeeMoney,
  canWriteSection,
  sectionAccess,
} from './permissions'

const ALL_SECTIONS: AdminSection[] = [
  'dashboard',
  'catalog',
  'orders',
  'users',
  'payments',
  'affiliates',
  'analytics',
  'audit-log',
  'suppliers',
]

describe('sectionAccess', () => {
  it('gives the admin tier write access everywhere', () => {
    for (const section of ALL_SECTIONS) {
      expect(sectionAccess('admin', section)).toBe('write')
      expect(sectionAccess('super_admin', section)).toBe('write')
    }
  })

  it('limits content_uploader to catalog only', () => {
    expect(sectionAccess('content_uploader', 'catalog')).toBe('write')
    for (const section of ALL_SECTIONS.filter((s) => s !== 'catalog')) {
      expect(sectionAccess('content_uploader', section)).toBe('none')
    }
  })

  it('gives support operational reads and never write', () => {
    expect(sectionAccess('support', 'orders')).toBe('read')
    expect(sectionAccess('support', 'users')).toBe('read')
    expect(sectionAccess('support', 'dashboard')).toBe('read')
    expect(sectionAccess('support', 'affiliates')).toBe('read')
    expect(sectionAccess('support', 'suppliers')).toBe('read')
    for (const section of ALL_SECTIONS) {
      expect(sectionAccess('support', section)).not.toBe('write')
    }
  })

  it('blocks support from money, security and catalog sections', () => {
    expect(sectionAccess('support', 'payments')).toBe('none')
    expect(sectionAccess('support', 'analytics')).toBe('none')
    expect(sectionAccess('support', 'audit-log')).toBe('none')
    expect(sectionAccess('support', 'catalog')).toBe('none')
  })

  it('blocks customer, vendor and missing roles everywhere', () => {
    for (const section of ALL_SECTIONS) {
      expect(sectionAccess('customer', section)).toBe('none')
      expect(sectionAccess('vendor', section)).toBe('none')
      expect(sectionAccess(null, section)).toBe('none')
      expect(sectionAccess(undefined, section)).toBe('none')
    }
  })
})

describe('canReadSection / canWriteSection', () => {
  it('read follows any non-none access', () => {
    expect(canReadSection('support', 'orders')).toBe(true)
    expect(canReadSection('support', 'payments')).toBe(false)
    expect(canReadSection('content_uploader', 'catalog')).toBe(true)
  })

  it('write requires write access', () => {
    expect(canWriteSection('support', 'orders')).toBe(false)
    expect(canWriteSection('admin', 'orders')).toBe(true)
    expect(canWriteSection('content_uploader', 'catalog')).toBe(true)
  })
})

describe('canSeeMoney', () => {
  it('is admin tier only', () => {
    expect(canSeeMoney('super_admin')).toBe(true)
    expect(canSeeMoney('admin')).toBe(true)
    expect(canSeeMoney('support')).toBe(false)
    expect(canSeeMoney('content_uploader')).toBe(false)
    expect(canSeeMoney(null)).toBe(false)
  })
})

describe('role assignment', () => {
  it('super_admin can assign every role', () => {
    expect(assignableRoles('super_admin')).toContain('super_admin')
    expect(assignableRoles('super_admin')).toContain('admin')
    expect(assignableRoles('super_admin')).toContain('support')
  })

  it('admin can assign up to content_uploader/support, never admin tier', () => {
    const roles = assignableRoles('admin')
    expect(roles).toContain('support')
    expect(roles).toContain('content_uploader')
    expect(roles).not.toContain('admin')
    expect(roles).not.toContain('super_admin')
  })

  it('everyone else assigns nothing', () => {
    expect(assignableRoles('support')).toEqual([])
    expect(assignableRoles('content_uploader')).toEqual([])
    expect(assignableRoles('customer')).toEqual([])
    expect(assignableRoles(null)).toEqual([])
  })

  it('canAssignRole matches the assignable list', () => {
    expect(canAssignRole('admin', 'support')).toBe(true)
    expect(canAssignRole('admin', 'admin')).toBe(false)
    expect(canAssignRole('super_admin', 'admin')).toBe(true)
  })
})
