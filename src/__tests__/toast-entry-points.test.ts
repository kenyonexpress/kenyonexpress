import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX28: one toast API, one toaster policy, a toaster wherever a toast can be
 * raised.
 *
 * Measured before (logs/ux28/before.json, the build of a1ee1c030): twelve
 * files imported `toast` from sonner directly and twenty-five of their call
 * sites were admin screens whose layout mounted no toaster, so every one of
 * them painted nothing; three layouts repeated the same four Toaster props
 * and the fourth repeated none. These checks are the ratchet: a new direct
 * import, a new prop on a mount, or a `notify()` in a route group without a
 * toaster fails here with the fix in the message.
 */

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).map((f) => ({ path: relative(ROOT, f), source: readFileSync(f, 'utf8') }))

/** Route groups whose layout (or shell) mounts the toaster. */
const TOASTER_GROUPS = ['(store)', '(main)', '(account)', '(admin)'] as const

/** Component directories that raise toasts, and the group that renders them. */
const COMPONENT_HOSTS: Record<string, (typeof TOASTER_GROUPS)[number]> = {
  'src/components/cart': '(store)',
  'src/components/compare': '(store)',
  'src/components/wishlist': '(account)',
  'src/components/account': '(account)',
  'src/components/admin': '(admin)',
}

function callsNotify(source: string): boolean {
  return (
    /\bnotify\(/.test(source) &&
    /import \{[^}]*\bnotify\b[^}]*\} from '@\/lib\/ui\/toast'/.test(source)
  )
}

function groupOf(path: string): string | null {
  const m = path.match(/^src\/app\/(\([a-z-]+\))\//)
  return m ? (m[1] ?? null) : null
}

function mountsToaster(source: string): boolean {
  return /<DeferredToaster\s*\/>/.test(source) || /<Toaster\s*\/>/.test(source)
}

describe('sonner has one entry point', () => {
  it('is imported statically by components/ui/sonner.tsx and nowhere else', () => {
    const importers = FILES.filter((f) => /^import .* from 'sonner'/m.test(f.source)).map(
      (f) => f.path,
    )
    expect(importers, 'route a toast through notify() in src/lib/ui/toast.ts').toEqual([
      'src/components/ui/sonner.tsx',
    ])
  })

  it('is called only through lib/ui/toast.ts', () => {
    const callers = FILES.filter(
      (f) =>
        f.path !== 'src/lib/ui/toast.ts' &&
        /\btoast\.(success|error|info|warning|message|custom|promise|loading|dismiss)\(/.test(
          f.source,
        ),
    ).map((f) => f.path)
    expect(callers, 'use notify(kind, message, options) / dismissToast(id)').toEqual([])
  })

  it('leaves next-themes with no importer: the site has no dark mode', () => {
    const importers = FILES.filter((f) => f.source.includes("from 'next-themes'")).map(
      (f) => f.path,
    )
    expect(importers).toEqual([])
  })
})

describe('the toaster policy lives in one place', () => {
  it('every mount is a bare <Toaster /> or <DeferredToaster />', () => {
    const withProps = FILES.filter((f) =>
      /<(DeferredToaster|Toaster)\s+[a-zA-Z]/.test(f.source.replace(/<Sonner[\s\S]*?\/>/, '')),
    ).map((f) => f.path)
    expect(withProps, 'put the prop in components/ui/sonner.tsx instead').toEqual([])
  })

  it('mounts the toaster in each route group that can raise a toast', () => {
    const layout = (group: string) =>
      readFileSync(resolve(ROOT, `src/app/${group}/layout.tsx`), 'utf8')
    // (store) mounts through StoreShell -> DeferredStoreChrome.
    const storeLayout = layout('(store)')
    expect(storeLayout).toContain('StoreShell')
    const shell = readFileSync(resolve(ROOT, 'src/components/store/StoreShell.tsx'), 'utf8')
    expect(shell).toContain('DeferredStoreChrome')
    const chrome = readFileSync(
      resolve(ROOT, 'src/components/store/DeferredStoreChrome.tsx'),
      'utf8',
    )
    expect(mountsToaster(chrome)).toBe(true)
    for (const group of TOASTER_GROUPS) {
      if (group === '(store)') continue
      expect(mountsToaster(layout(group)), `${group}/layout.tsx mounts <DeferredToaster />`).toBe(
        true,
      )
    }
  })

  it('has no notify() caller in a route group without a toaster', () => {
    const orphans = FILES.filter((f) => {
      if (!callsNotify(f.source)) return false
      const group = groupOf(f.path)
      return group !== null && !(TOASTER_GROUPS as readonly string[]).includes(group)
    }).map((f) => f.path)
    expect(
      orphans,
      'add <DeferredToaster /> to that group’s layout and list the group in TOASTER_GROUPS',
    ).toEqual([])
  })

  it('has no notify() caller in a component directory without a known host', () => {
    const unknown = FILES.filter((f) => {
      if (!callsNotify(f.source) || !f.path.startsWith('src/components/')) return false
      return !Object.keys(COMPONENT_HOSTS).some((dir) => f.path.startsWith(`${dir}/`))
    }).map((f) => f.path)
    expect(
      unknown,
      'name the directory’s host group in COMPONENT_HOSTS (and make sure that layout mounts the toaster)',
    ).toEqual([])
  })

  it('still raises toasts from the call sites the measurement counted', () => {
    // The admin screens that painted nothing before UX28; a silent removal of
    // their feedback should be a decision, not a side effect.
    for (const path of [
      'src/app/(admin)/admin/approvals/ApprovalActionsClient.tsx',
      'src/app/(admin)/admin/payouts/PayoutActionsClient.tsx',
      'src/app/(admin)/admin/payouts/GeneratePayoutClient.tsx',
      'src/app/(admin)/admin/cashback/AdjustCashbackClient.tsx',
      'src/components/admin/ProductsTable.tsx',
      'src/components/admin/CategoryTree.tsx',
      'src/components/cart/CartProvider.tsx',
      'src/components/compare/CompareButton.tsx',
      'src/components/wishlist/WishlistPageView.tsx',
    ]) {
      const file = FILES.find((f) => f.path === path)
      expect(file && callsNotify(file.source), `${path} calls notify()`).toBe(true)
    }
  })
})
