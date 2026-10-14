import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * THE GENERIC FALLBACK IS NEVER SILENT.
 *
 * Every key in the map is an English string SUPABASE chooses, matched by
 * substring, and none of it is under our control. When one is reworded
 * upstream the match stops firing and "כתובת אימייל או סיסמה שגויים" silently
 * becomes the generic "אירעה שגיאה, נסו שוב": the form still looks like it
 * works, the customer is told nothing useful, and we are told nothing at all.
 *
 * Until UX24 the map lived inside `server/actions/auth.ts`, whose `'use
 * server'` directive forbids exporting a sync helper, so this file read the
 * SOURCE for `function toHebrew`. The map now lives in
 * `server/auth/gotrue-errors.ts` (the registration core needed it outside
 * the actions file), so the behaviour is tested directly.
 */

const warn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observability/log', () => ({
  log: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { gotrueErrorHebrew } from '@/server/auth/gotrue-errors'

describe('the Supabase error map', () => {
  it('logs before falling back to the generic message, with the unmatched text', () => {
    warn.mockClear()
    expect(gotrueErrorHebrew('Something GoTrue started saying today')).toBe('אירעה שגיאה, נסו שוב')
    // The unmatched message itself is what makes the log worth having: without
    // it the entry says only "something was unmapped".
    expect(warn).toHaveBeenCalledWith('auth.error_unmapped', {
      reason: 'Something GoTrue started saying today',
    })
  })

  it('keeps the upstream text out of what the customer is shown', () => {
    const raw = 'database error saving new user (code 23505)'
    expect(gotrueErrorHebrew(raw)).not.toContain('database')
    expect(gotrueErrorHebrew(raw)).not.toContain('23505')
  })

  it('still maps the credential failure a shopper actually hits, and does not log it', () => {
    warn.mockClear()
    // The generic fallback being logged is not a licence to lose the mapping
    // that matters most: a wrong password is the common case on this form.
    expect(gotrueErrorHebrew('Invalid login credentials')).toBe('כתובת אימייל או סיסמה שגויים')
    expect(gotrueErrorHebrew('AuthApiError: User already registered')).toBe(
      'כתובת האימייל כבר רשומה במערכת',
    )
    expect(warn).not.toHaveBeenCalled()
  })

  /*
    THE FIRST STRING THE LOG ABOVE ACTUALLY CAUGHT.

    A direct visit to /reset-password - which is also what an expired or
    already-used mail link amounts to, since the recovery session is what
    authorises `updateUser` - wrote `auth.error_unmapped … reason: "Auth session
    missing!"`, and the customer was shown "אירעה שגיאה, נסו שוב" on a page
    that carried no other link. True, useless, and a dead end.

    Pinned because it is the ONLY way this page fails for a real customer, and
    because losing it would be invisible: the generic message would come back
    and the page would still render.
  */
  it('names the expired reset link instead of falling back', () => {
    const hebrew = gotrueErrorHebrew('Auth session missing!')
    expect(hebrew).toContain('קישור האיפוס')
    expect(hebrew).not.toBe('אירעה שגיאה, נסו שוב')
  })

  it('leaves the customer somewhere to go when the link has expired', () => {
    // The message tells them to ask for a new link; this is the only element on
    // that screen that can take them anywhere.
    const form = readFileSync(
      join(process.cwd(), 'src/app/(auth)/reset-password/ResetPasswordForm.tsx'),
      'utf8',
    )
    expect(form).toContain('href="/forgot-password"')
  })
})
