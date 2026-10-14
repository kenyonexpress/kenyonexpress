import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_TABS, activeAccountTab } from './tabs'

/**
 * UX18: the five account tabs and the rule that lights one of them.
 */
describe('ACCOUNT_TABS', () => {
  it('are the five places, in order, labelled in Hebrew', () => {
    expect(ACCOUNT_TABS.map((t) => t.id)).toEqual([
      'overview',
      'orders',
      'wishlist',
      'addresses',
      'settings',
    ])
    expect(ACCOUNT_TABS.map((t) => t.label)).toEqual([
      'סקירה',
      'ההזמנות שלי',
      'רשימת המשאלות',
      'כתובות',
      'הגדרות',
    ])
    for (const tab of ACCOUNT_TABS) {
      expect(tab.label).toMatch(/^[֐-׿ ]+$/)
    }
  })

  it('every tab opens a page that exists under src/app/(account)/account', () => {
    const base = join(process.cwd(), 'src/app/(account)/account')
    for (const tab of ACCOUNT_TABS) {
      const rel = tab.href === '/account' ? '' : tab.href.replace('/account/', '')
      expect(existsSync(join(base, rel, 'page.tsx')), tab.href).toBe(true)
    }
  })

  it('every match prefix is a path under /account', () => {
    for (const tab of ACCOUNT_TABS) {
      expect(tab.matches).toContain(tab.href)
      for (const m of tab.matches) expect(m.startsWith('/account')).toBe(true)
    }
  })
})

describe('activeAccountTab', () => {
  it.each([
    ['/account', 'overview'],
    ['/account/', 'overview'],
    ['/account/orders', 'orders'],
    ['/account/orders/0a1b2c', 'orders'],
    ['/account/orders/0a1b2c/invoice', 'orders'],
    ['/account/return', 'orders'],
    ['/account/return/0a1b2c', 'orders'],
    ['/account/wishlist', 'wishlist'],
    ['/account/addresses', 'addresses'],
    ['/account/settings', 'settings'],
    ['/account/details', 'settings'],
    ['/account/notifications', 'settings'],
    ['/account/security', 'settings'],
    ['/account/privacy', 'settings'],
    ['/account/tokens', 'settings'],
  ] as const)('%s lights %s', (path, id) => {
    expect(activeAccountTab(path)).toBe(id)
  })

  it.each(['/account/wallet', '/account/coupons', '/account/loyalty', '/account/referrals'])(
    '%s lights nothing: it has no tab',
    (path) => {
      expect(activeAccountTab(path)).toBeNull()
    },
  )

  it('the overview never lights for a child, and a prefix is a path segment', () => {
    expect(activeAccountTab('/account/wallet')).not.toBe('overview')
    expect(activeAccountTab('/account/ordersx')).toBeNull()
    expect(activeAccountTab('/account/addresses-old')).toBeNull()
  })

  it('ignores a query string', () => {
    expect(activeAccountTab('/account/orders?page=2')).toBe('orders')
  })
})
