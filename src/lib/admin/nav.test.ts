import { describe, expect, it } from 'vitest'
import { adminLandingPath, canAccessAdminSection, visibleAdminHrefs } from './nav'

describe('canAccessAdminSection', () => {
  // The bug: content_uploader was blocked from the whole admin panel, including
  // /admin/products which their product actions (requireStaffSession) allow.
  it('lets content_uploader reach products and its sub-paths', () => {
    expect(canAccessAdminSection('content_uploader', '/admin/products')).toBe(true)
    expect(canAccessAdminSection('content_uploader', '/admin/products/new')).toBe(true)
    expect(canAccessAdminSection('content_uploader', '/admin/products/abc/edit')).toBe(true)
  })

  it('keeps content_uploader out of admin-only sections', () => {
    expect(canAccessAdminSection('content_uploader', '/admin/dashboard')).toBe(false)
    expect(canAccessAdminSection('content_uploader', '/admin/users')).toBe(false)
    expect(canAccessAdminSection('content_uploader', '/admin/suppliers')).toBe(false)
    expect(canAccessAdminSection('content_uploader', '/admin/orders/xyz')).toBe(false)
  })

  it('gives admin and super_admin access to everything', () => {
    for (const href of ['/admin/dashboard', '/admin/users', '/admin/products', '/admin/orders']) {
      expect(canAccessAdminSection('admin', href)).toBe(true)
      expect(canAccessAdminSection('super_admin', href)).toBe(true)
    }
  })

  it('denies non-staff roles entirely', () => {
    expect(canAccessAdminSection('customer', '/admin/products')).toBe(false)
    expect(canAccessAdminSection('vendor', '/admin/products')).toBe(false)
  })
})

describe('visibleAdminHrefs', () => {
  it('shows content_uploader only the products section', () => {
    expect(visibleAdminHrefs('content_uploader')).toEqual(['/admin/products'])
  })

  it('shows admins all sections', () => {
    expect(visibleAdminHrefs('admin')).toContain('/admin/users')
    expect(visibleAdminHrefs('admin').length).toBeGreaterThan(1)
  })
})

describe('adminLandingPath', () => {
  it('sends content_uploader to products', () => {
    expect(adminLandingPath('content_uploader')).toBe('/admin/products')
  })

  it('sends admins to the dashboard', () => {
    expect(adminLandingPath('admin')).toBe('/admin/dashboard')
    expect(adminLandingPath('super_admin')).toBe('/admin/dashboard')
  })
})
