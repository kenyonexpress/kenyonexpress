import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The overview reaches every section the account holds, and the account holds
 * exactly one way to delete itself.
 *
 * Server components are not renderable in this suite, so like
 * coupons/reachable.test.ts these read the routes as source. What was wrong
 * when this was written: the overview linked four of eight sections, the
 * notification switch matrix was rendered by nothing, and /account/details
 * and /account/privacy each carried their own deletion form, backed by two
 * server actions with two confirmation phrases and two erasure lists.
 */

const APP = join(process.cwd(), 'src/app')
const ACCOUNT = join(APP, '(account)/account')
const OVERVIEW = join(ACCOUNT, 'page.tsx')
const NOTIFICATIONS = join(ACCOUNT, 'notifications/page.tsx')
const DETAILS = join(ACCOUNT, 'details/page.tsx')
const SETTINGS = join(ACCOUNT, 'settings/page.tsx')
const WISHLIST = join(ACCOUNT, 'wishlist/page.tsx')
const PRIVACY = join(ACCOUNT, 'privacy/page.tsx')

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('the overview', () => {
  const overview = code(OVERVIEW)

  it.each([
    '/account/orders',
    '/account/coupons',
    '/account/wallet',
    '/account/cashback',
    '/account/addresses',
    '/account/tokens',
    '/account/notifications',
    '/account/privacy',
  ])('links to %s', (href) => {
    expect(overview).toContain(`href="${href}"`)
  })

  it('summarises through the pure module, not inline arithmetic', () => {
    expect(overview).toContain("from '@/lib/account/overview'")
    expect(overview).toContain('summarizePaymentMethods(')
    expect(overview).toContain('summarizeAddresses(')
    expect(overview).toContain('summarizePreferences(')
  })

  it('shows a card by its masked label and never by a token field', () => {
    expect(overview).toContain('cardLabel(')
    expect(overview).not.toMatch(/cardcom|Token\b/i)
  })
})

describe('the notification switches', () => {
  it('are rendered by the notifications page, from rows read under RLS', () => {
    const page = code(NOTIFICATIONS)
    // STEP 49: the center loads the preference rows once (through
    // `loadPreferences()` inside `loadNotificationCenter`, still under RLS on
    // the session client) and the page hands them to the matrix.
    expect(page).toContain('<PreferenceSwitches rows={center.preferences} />')
    expect(page).toContain('loadNotificationCenter(')
    expect(page).not.toMatch(/createAdminClient|service_role/)
  })
})

describe('the tabs (UX18)', () => {
  it('the settings hub holds the profile form and the sign-out that /account/details held', () => {
    const settings = code(SETTINGS)
    expect(settings).toContain('<ProfileDetailsForm')
    expect(settings).toContain('action={signOut}')
    for (const href of [
      '/account/notifications',
      '/account/security',
      '/account/tokens',
      '/account/privacy',
    ]) {
      expect(settings).toContain(`href="${href}"`)
    }
  })

  it('/account/details is a permanent redirect to the hub, with no form of its own', () => {
    const details = code(DETAILS)
    expect(details).toContain("permanentRedirect('/account/settings')")
    expect(details).not.toContain('ProfileDetailsForm')
  })

  it('/account/wishlist is a page inside the shell, not a bounce to the public page', () => {
    const wishlist = code(WISHLIST)
    expect(wishlist).toContain('<WishlistPageView embedded />')
    expect(wishlist).not.toMatch(/redirect\(/)
  })

  it('the layout renders the tab bar as a grid sibling of the nav and the content', () => {
    const layout = code(join(APP, '(account)/layout.tsx'))
    expect(layout).toContain('<AccountTabsSlot />')
    expect(layout.indexOf('<AccountTabsSlot />')).toBeGreaterThan(
      layout.indexOf('<AccountSideNav />'),
    )
    expect(layout.indexOf('<AccountTabsSlot />')).toBeLessThan(
      layout.indexOf('className="account-content"'),
    )
  })

  it('the tab bar is on the request-time resume path, behind a fallback with no tab lit', () => {
    // usePathname() resolving inside the prerender wrote a nonce-less
    // $RC(...) into 21 account shells and failed csp-shell-gate (UX18,
    // logs/ux18/build2.log). connection() stops the prerender at the slot.
    const layout = code(join(APP, '(account)/layout.tsx'))
    const slot = layout.slice(layout.indexOf('async function AccountTabsSlot'))
    expect(slot).toMatch(/await connection\(\)[\s\S]*?return <AccountTabs \/>/)
    expect(layout).toContain("import { connection } from 'next/server'")
    expect(layout).toMatch(
      /<Suspense fallback=\{<AccountTabsList active=\{null\} \/>\}>\s*<AccountTabsSlot \/>/,
    )
  })

  it('the side nav sends the wishlist and the settings into the shell', () => {
    const nav = code(join(process.cwd(), 'src/components/account/AccountNav.tsx'))
    expect(nav).toContain("href: '/account/wishlist'")
    expect(nav).toContain("href: '/account/settings'")
    expect(nav).not.toContain("href: '/wishlist'")
    expect(nav).not.toContain("href: '/account/details'")
  })
})

describe('account deletion', () => {
  it('has one form, on the privacy page', () => {
    const forms = sourceFiles(ACCOUNT)
      .filter((file) => /DeleteAccount\w*\s*\/>/.test(code(file)))
      .map((file) => relative(process.cwd(), file))
    expect(forms).toEqual([relative(process.cwd(), PRIVACY)])
    expect(code(PRIVACY)).toContain('<DeleteAccountForm />')
  })

  it('is reached from the settings hub rather than duplicated there', () => {
    const settings = code(SETTINGS)
    expect(settings).toContain('href="/account/privacy"')
    expect(settings).not.toContain('DeleteAccountSection')
  })

  it('has one server action and one confirmation word', () => {
    const src = join(process.cwd(), 'src')
    const importers = sourceFiles(src)
      .filter((file) => /lib\/account\/delete-account'|deleteAccount\b/.test(code(file)))
      .map((file) => relative(process.cwd(), file))
    expect(importers).toEqual([])
    expect(code(join(src, 'server/actions/privacy.ts'))).toContain('DELETE_CONFIRM_WORD')
  })
})
