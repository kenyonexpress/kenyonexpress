import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every exported function in a `'use server'` file is a network endpoint.
 *
 * Next registers an action id for each one, so anybody can POST to it. The
 * regression this guards is invisible in review: a new action added next to
 * twenty guarded neighbours still compiles, still typechecks, still passes its
 * own unit test, and is reachable by anyone on the internet. Nothing fails.
 *
 * WHY THIS WALKS THE CALL GRAPH INSTEAD OF GREPPING. Every action in this
 * codebase is a one-line wrapper:
 *
 *     export async function approvePayoutStatement(id: string) {
 *       return withActionContext('admin.payout.approve', () => runApprove(id))
 *     }
 *
 * The guard lives in `runApprove`, and in `payouts.ts` one hop further still,
 * behind a local `guard()`. A flat grep over the exported bodies reports
 * 0 of 84 guarded, which is entirely false. Only a transitive walk gives a
 * number worth asserting on.
 */

const ACTIONS_DIR = resolve(__dirname, '.')
const SRC = resolve(__dirname, '../..')

/** The real guard entry points. `src/lib/admin/rbac.ts` exports the first six. */
const GUARD =
  /requireAdminSession|requireStaffSession|requireAdminPage|requirePanelSession|requireSection|getSessionWithRole|requireAdmin\b|requireUser|requireAuth|assertAdmin|getAuthedUser|requireSupplier|auth\.getUser|getUser\(\)/

/**
 * Actions that are deliberately reachable without a session. Each one is here
 * for a stated reason, and adding a name to this list is the decision the test
 * exists to make deliberate.
 */
const PUBLIC_ACTIONS = new Map<string, string>([
  // Signing in cannot require being signed in. signOut/signOutAll take no
  // arguments and act on the caller's own session.
  ['auth.ts:signInWithGoogle', 'sign-in entry point'],
  ['auth.ts:signInWithEmail', 'sign-in entry point'],
  ['auth.ts:signUpWithEmail', 'registration'],
  ['auth.ts:sendMagicLink', 'sign-in entry point'],
  ['auth.ts:sendPhoneOtp', 'sign-in entry point, rate limited per IP and per number'],
  ['auth.ts:verifyPhoneOtp', 'sign-in entry point, rate limited per IP'],
  ['auth.ts:signOut', "acts on the caller's own session, no arguments"],
  ['auth.ts:signOutAll', "acts on the caller's own session, no arguments"],
  ['auth.ts:sendPasswordReset', 'reset must work when locked out'],
  ['auth.ts:updatePassword', 'runs against the recovery session Supabase issued'],
  // The guest cart is open by business-model decision: browsing and adding to
  // cart never require an account.
  ['cart.ts:mergeGuestCart', 'internal helper, see STATE.md 20.08 finding 1'],
  ['cart.ts:clearGuestSessionCookie', "deletes the caller's own cookie"],
  // Public forms. All four are rate limited per IP in their own bodies.
  ['contact.ts:submitContactForm', 'public form, rate limited'],
  ['supplier-lead.ts:submitSupplierLead', 'public form, rate limited'],
  ['consent.ts:decideConsent', 'cookie-banner decision, records no personal data'],
  // Token-bearing links, where the unguessable token is the authorisation.
  ['newsletter.ts:confirmNewsletter', 'token in the confirmation link is the authorisation'],
  ['newsletter.ts:unsubscribeByToken', 'unsubscribe must work from an email client'],
  ['gifts.ts:loadGiftPreview', 'claim token is the authorisation'],
])

function filesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...filesUnder(path))
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

/** The body of the declaration starting at `start`, by brace depth. */
function bodyAt(lines: string[], start: number): string {
  let depth = 0
  let opened = false
  let body = ''
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? ''
    body += `${line}\n`
    for (const ch of line) {
      if (ch === '{') {
        depth++
        opened = true
      } else if (ch === '}') depth--
    }
    if (opened && depth === 0) break
  }
  return body
}

const callees = (body: string) =>
  new Set([...body.matchAll(/\b(\w+)\s*\(/g)].map((m) => m[1] as string))

/** Exported actions that never reach a guard, keyed `file.ts:actionName`. */
function unguardedActions(): string[] {
  const serverFiles = filesUnder(ACTIONS_DIR).filter((f) =>
    /^['"]use server['"]/m.test(readFileSync(f, 'utf8')),
  )

  const unguarded: string[] = []
  for (const file of serverFiles) {
    const lines = readFileSync(file, 'utf8').split('\n')

    // Index every local declaration, then take the fixed point of "reaches a
    // guard" over the local call graph.
    const declared = new Map<string, number>()
    lines.forEach((line, i) => {
      const m =
        line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ??
        line.match(/^(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?[(<]/)
      if (m && !declared.has(m[1] as string)) declared.set(m[1] as string, i)
    })
    const bodies = new Map([...declared].map(([n, i]) => [n, bodyAt(lines, i)]))
    const reaches = new Map([...bodies].map(([n, b]) => [n, GUARD.test(b)]))
    for (let pass = 0; pass < 12; pass++) {
      let changed = false
      for (const [name, body] of bodies) {
        if (reaches.get(name)) continue
        for (const callee of callees(body)) {
          if (callee !== name && reaches.get(callee)) {
            reaches.set(name, true)
            changed = true
            break
          }
        }
      }
      if (!changed) break
    }

    lines.forEach((line, i) => {
      const m = line.match(/^export\s+async\s+function\s+(\w+)/)
      if (!m) return
      const name = m[1] as string
      const body = bodyAt(lines, i)
      const guarded =
        GUARD.test(body) || [...callees(body)].some((c) => c !== name && reaches.get(c))
      if (!guarded) unguarded.push(`${relative(SRC, file).replace('server/actions/', '')}:${name}`)
    })
  }
  return unguarded
}

describe('server action authorization coverage', () => {
  it('every exported action reaches a guard or is a declared public endpoint', () => {
    const undeclared = unguardedActions().filter((key) => !PUBLIC_ACTIONS.has(key))
    // A failure here means a new `export async function` in a 'use server' file
    // has no auth guard on any path. Add the guard, or add the name to
    // PUBLIC_ACTIONS with the reason it is safe to expose.
    expect(undeclared).toEqual([])
  })

  it('the public allowlist has no stale entries', () => {
    // Keeps the list honest: once an action gains a guard, its exemption must
    // go, or the next genuinely unguarded action inherits a free pass.
    const stillUnguarded = new Set(unguardedActions())
    const stale = [...PUBLIC_ACTIONS.keys()].filter((key) => !stillUnguarded.has(key))
    expect(stale).toEqual([])
  })
})
