import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every privileged route proves who is calling, in its own file.
 *
 * WHY A SOURCE SCAN RATHER THAN A REQUEST TEST. The guards are
 * `redirect()`-based server functions; exercising them for real needs a running
 * Next server, a Supabase session and a seeded role per case, which is the E2E
 * suite's job and takes minutes. What actually goes wrong in this repo is
 * simpler and cheaper to catch: somebody adds a page under `(admin)` and forgets
 * the guard line. That already happened once -- `/admin/products` shipped
 * relying on the layout alone, which let `support` (a role explicitly denied the
 * catalog in `lib/admin/permissions.ts`) list every product. A file scan is the
 * only test that fails the moment such a file appears.
 *
 * WHAT THE LAYOUT DOES NOT DO. `(admin)/layout.tsx` calls `requirePanelSession`,
 * which proves panel ENTRY and nothing else -- support, content_uploader and
 * admin all pass it. Section access is decided per page. So "the layout covers
 * it" is not a defence, and this test deliberately does not accept one.
 */

const ROOTS = ['src/app/(admin)', 'src/app/(supplier)', 'src/app/api/admin', 'src/app/api/supplier']

/** Anything that establishes the caller's identity AND their authority. */
const GUARDS = [
  // lib/admin/rbac.ts
  'requireAdminSession',
  'requireStaffSession',
  'requireAdminPage',
  'requirePanelSession',
  'requireSection',
  'getSessionWithRole',
  // lib/supplier/rbac.ts
  'requireSupplierMember',
  'requireSupplierRole',
  'getSupplierSession',
  'getSupplierMemberships',
  // lib/supabase/bearer.ts — the till app authenticates by bearer token, not by
  // cookie, so its routes cannot use the redirect guards. Returning null for an
  // unauthenticated caller is the same decision in a different shape.
  'identityScopedClient',
]

/**
 * Files that legitimately carry no guard. Each needs a reason, and the reason is
 * checked: the entry names the substring that must appear in the file, so an
 * allowlisted file that is later rewritten into something else fails here.
 */
const EXEMPT: Record<string, { because: string; mustContain: string }> = {
  'src/app/(supplier)/supplier/scan/page.tsx': {
    because: 'pure redirect to /scan, which is guarded; it reads nothing itself',
    mustContain: "redirect('/scan')",
  },
  'src/app/api/supplier/redeem/route.ts': {
    because: 'alias that re-exports the guarded /api/supplier/vouchers/redeem handler',
    mustContain: "export { POST } from '@/app/api/supplier/vouchers/redeem/route'",
  },
}

function walk(dir: string): string[] {
  let found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found = found.concat(walk(full))
      continue
    }
    if (/^(page|route|layout)\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

function routeFiles(): string[] {
  const cwd = process.cwd()
  return ROOTS.flatMap((root) => {
    const abs = resolve(cwd, root)
    try {
      if (!statSync(abs).isDirectory()) return []
    } catch {
      // A root that does not exist is not a silent pass: the count assertion
      // at the bottom is what notices a whole tree going missing.
      return []
    }
    return walk(abs).map((file) => relative(cwd, file).split('\\').join('/'))
  }).sort()
}

/** Comments name guards constantly. Only real code counts as calling one. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

describe('privileged routes are guarded', () => {
  const files = routeFiles()

  it('finds the admin and supplier route trees at all', () => {
    // Guards against the scan silently passing because a rename moved every
    // route out from under ROOTS.
    expect(files.length).toBeGreaterThanOrEqual(45)
  })

  it.each(files)('%s calls a guard', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const exemption = EXEMPT[file]

    if (exemption) {
      expect(source, `${file} is exempt because ${exemption.because}`).toContain(
        exemption.mustContain,
      )
      return
    }

    const code = codeOnly(source)
    const used = GUARDS.filter((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(code))
    expect(
      used,
      `${file} has no authorization check. Call one of: ${GUARDS.join(', ')} — or add it to EXEMPT with a reason.`,
    ).not.toHaveLength(0)
  })

  it('every exemption still points at a file that exists', () => {
    for (const file of Object.keys(EXEMPT)) {
      expect(files, `EXEMPT names ${file}, which the scan no longer sees`).toContain(file)
    }
  })
})
