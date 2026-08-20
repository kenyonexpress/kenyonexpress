import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every route handler under /api/admin and /api/supplier establishes who is
 * calling it. Enforced at the source level, because the proxy cannot do it
 * alone and a page guard is not inherited by a route.
 *
 * WHY THE PROXY IS NOT ENOUGH. `src/proxy.ts` gates `/admin` and `/supplier`,
 * the page prefixes. `/api/admin` and `/api/supplier` do not start with either,
 * so before this wave they passed through it untouched -- `/api/admin/reports`
 * is a plain GET at a guessable URL returning every shekel the platform has
 * taken, and its own in-file guard was the only thing between the two. The
 * proxy now covers the API prefixes as well, but a proxy check is a perimeter:
 * it can be bypassed by a matcher edit, and it cannot tell a scanner device's
 * bearer token from a stranger's. The in-handler check is the real one; this
 * test is what keeps it from being dropped.
 *
 * WHY IT FOLLOWS RE-EXPORTS. `/api/supplier/redeem/route.ts` is thirteen lines
 * and twelve of them are a comment: it re-exports POST from
 * `/api/supplier/vouchers/redeem`. A flat grep calls that file unguarded and is
 * wrong, and a test that is wrong on the file it was written for gets deleted
 * rather than fixed. Any guard named below counts if it appears in the file OR
 * in the module it re-exports its handlers from.
 */

const ROOTS = ['src/app/api/admin', 'src/app/api/supplier']

/**
 * A guard here means: this line of code decides WHO the caller is. Anything
 * that only decides what they may do -- `canReadSection`, `hasMinRole` -- is
 * absent on purpose: it answers the second question and reads as authorization
 * while checking nothing about identity.
 */
const GUARDS = [
  'identityScopedClient',
  'authenticateRequest',
  'getSessionWithRole',
  'requireSupplierMember',
  'requireSupplierRole',
  'checkRoleForRequest',
  'denyRole',
  'auth.getUser(',
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

function routeFiles(root: string): string[] {
  const absolute = resolve(process.cwd(), root)
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'route.ts' || entry === 'route.tsx') found.push(full)
    }
  }
  walk(absolute)
  return found.sort()
}

/** Strip comments: this file's own prose names every guard it looks for. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

/** `export { POST } from '@/app/...'` -> the file that module resolves to. */
function reExportTargets(code: string): string[] {
  const targets: string[] = []
  const pattern = /export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g
  for (const match of code.matchAll(pattern)) {
    const specifier = match[1]
    if (!specifier?.startsWith('@/')) continue
    targets.push(resolve(process.cwd(), 'src', `${specifier.slice(2)}.ts`))
  }
  return targets
}

function guarded(file: string, depth = 0): boolean {
  const code = codeOnly(readFileSync(file, 'utf8'))
  if (GUARDS.some((guard) => code.includes(guard))) return true
  // One hop. Two would mean an alias of an alias, which is a thing to notice
  // rather than to resolve.
  if (depth > 0) return false
  return reExportTargets(code).some((target) => guarded(target, depth + 1))
}

function exportsAHandler(code: string): boolean {
  return HTTP_METHODS.some(
    (method) =>
      new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${method}\\b`).test(code) ||
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(code),
  )
}

describe('no admin or supplier route without an identity check', () => {
  const files = ROOTS.flatMap(routeFiles)

  it('finds the routes at all, so an empty sweep cannot pass silently', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  for (const file of files) {
    const relative = file.slice(resolve(process.cwd()).length + 1)
    it(`${relative} authenticates its caller`, () => {
      const code = codeOnly(readFileSync(file, 'utf8'))
      // A route.ts exporting no handler is not a route; nothing to guard.
      if (!exportsAHandler(code)) return
      expect(guarded(file)).toBe(true)
    })
  }
})

describe('the proxy covers the API prefixes too', () => {
  /**
   * The perimeter half. `/api/admin` and `/api/supplier` were outside every
   * branch in the proxy while `/admin` and `/supplier` were inside one, and the
   * gap was invisible because the prefixes look alike.
   */
  it('names /api/admin and /api/supplier', () => {
    const proxy = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')
    expect(codeOnly(proxy)).toContain('/api/admin')
    expect(codeOnly(proxy)).toContain('/api/supplier')
  })
})
