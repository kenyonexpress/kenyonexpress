'use client'

import { GoogleLogo } from '@/components/shared/GoogleLogo'
import { isPlainActivation } from '@/lib/auth/login-dialog'
import {
  type AuthState,
  sendMagicLink,
  signInWithEmail,
  signInWithGoogle,
  verifyEmailOtp,
} from '@/server/actions/auth'
import Link from 'next/link'
import { type KeyboardEvent, type MouseEvent, useActionState, useState } from 'react'
import PasskeyLoginButton from './PasskeyLoginButton'
import PhoneOtpForm from './PhoneOtpForm'

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

function getSuccess(state: AuthState): string | null {
  return state && 'success' in state ? state.success : null
}

export type LoginTab = 'email' | 'phone'

const TAB_LABELS: Record<LoginTab, string> = {
  email: 'אימייל וסיסמה',
  phone: 'קוד ב-SMS',
}

/**
 * The next tab for an arrow key, in the direction the page is laid out.
 * In RTL the tab to the RIGHT is the previous one, so ArrowRight moves back
 * and ArrowLeft moves forward; Home and End are direction-free. Exported for
 * the test, which pins both directions.
 */
export function nextTabForKey(
  key: string,
  tabs: readonly LoginTab[],
  current: LoginTab,
  rtl: boolean,
): LoginTab | null {
  const index = tabs.indexOf(current)
  if (index === -1 || tabs.length < 2) return null
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const forward = rtl ? key === 'ArrowLeft' : key === 'ArrowRight'
    const step = forward ? 1 : -1
    return tabs[(index + step + tabs.length) % tabs.length] ?? null
  }
  if (key === 'Home') return tabs[0] ?? null
  if (key === 'End') return tabs[tabs.length - 1] ?? null
  return null
}

/**
 * The direction the strip is laid out in: the computed value where there is
 * layout, the nearest `dir` attribute where there is none (jsdom computes no
 * `direction`, and the document's `dir="rtl"` is the truth there too).
 */
function isRtl(el: HTMLElement): boolean {
  const computed = getComputedStyle(el).direction
  if (computed) return computed === 'rtl'
  return (el.closest('[dir]')?.getAttribute('dir') ?? 'ltr') === 'rtl'
}

const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent'
const CODE_FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent'
const SECONDARY_BUTTON =
  'w-full flex min-h-touch-min items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60'
const PRIMARY_BUTTON =
  'w-full min-h-touch-min bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors'
const OUTLINE_BUTTON =
  'w-full min-h-touch-min border border-brand text-heading hover:bg-brand/5 disabled:opacity-60 font-semibold rounded-lg py-2.5 text-sm transition-colors'
const ERROR = 'text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2'
const SUCCESS = 'text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2'

export interface LoginPanelProps {
  next?: string
  callbackError?: string
  magic?: string
  /** Forced re-auth (STEP 18): a saved-card change asked for a fresh proof. */
  reauth?: boolean
  /**
   * Whether an SMS provider is actually wired into the Supabase project. False
   * hides the tab entirely rather than showing one that always fails: without
   * a provider, every send returns an error the customer cannot act on.
   */
  phoneEnabled?: boolean
  /**
   * `page` is the /login card; `dialog` is the same body inside the
   * storefront's login dialog (UX23), where the heading belongs to the
   * dialog and the signup link closes it on the way out.
   */
  variant?: 'page' | 'dialog'
  /**
   * Inside the dialog (UX24): a plain press on "הרשמה" switches the dialog
   * to the register stepper in place instead of leaving for /signup. The
   * anchor keeps its href, so a modifier, a middle button and no JavaScript
   * still open the page.
   */
  onSignup?: () => void
}

/**
 * Every way into an account, in one body shared by the /login page and the
 * login dialog (UX23).
 *
 * THE ORDER IS THE ORDER OF LEAST TYPING. Google and the passkey first: one
 * press each. Then the two typed ways as TABS, email + password and an SMS
 * code, so the second one is a visible choice rather than a button buried
 * under a password field. The magic link is the fallback under the tabs: it
 * works on every device and every account, which is why the passkey button
 * opens it when the passkey will not cooperate.
 *
 * THE TABS ARE REAL TABS. `role="tablist"` / `tab` / `tabpanel`, one tab
 * stop in the strip (roving tabindex), arrow keys that follow the page's
 * direction, Home and End, and the panel of the other tab `hidden` rather
 * than unmounted, so a number typed into the SMS tab survives a look at the
 * email one. With no SMS provider there is one way to type and no strip at
 * all: one tab is not a choice.
 */
export default function LoginPanel({
  next,
  callbackError,
  magic,
  reauth = false,
  phoneEnabled = false,
  variant = 'page',
  onSignup,
}: LoginPanelProps) {
  const idPrefix = variant === 'dialog' ? 'login-dialog' : 'login'
  const id = (name: string) => `${idPrefix}-${name}`
  const tabs: readonly LoginTab[] = phoneEnabled ? ['email', 'phone'] : ['email']
  const [tab, setTab] = useState<LoginTab>('email')
  const [showMagic, setShowMagic] = useState(false)

  const [emailState, emailAction, emailPending] = useActionState<AuthState, FormData>(
    signInWithEmail,
    null,
  )
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )
  const [magicState, magicAction, magicPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    null,
  )
  const [codeState, codeAction, codePending] = useActionState<AuthState, FormData>(
    verifyEmailOtp,
    null,
  )
  // The address the link was sent to, carried into the code step the way
  // PhoneOtpForm carries the number: the verify action needs the same address
  // the mail went to, and a second input would let the two drift.
  const [magicEmail, setMagicEmail] = useState('')

  const topError =
    getError(googleState) ??
    (callbackError === 'auth_callback_error' ? 'הכניסה נכשלה — נסו שוב' : null)

  function openMagicFallback() {
    setTab('email')
    setShowMagic(true)
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const rtl = isRtl(event.currentTarget)
    const target = nextTabForKey(event.key, tabs, tab, rtl)
    if (!target) return
    event.preventDefault()
    setTab(target)
    document.getElementById(id(`tab-${target}`))?.focus()
  }

  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'
  function onSignupClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!onSignup || !isPlainActivation(event)) return
    event.preventDefault()
    onSignup()
  }

  return (
    <div className="login-panel" data-variant={variant}>
      {reauth && (
        <output className="mb-4 block text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          לאבטחתך, שינוי אמצעי תשלום דורש התחברות מחדש. Face ID, טביעת אצבע או קישור למייל מספיקים.
        </output>
      )}
      {magic && !getSuccess(magicState) && (
        <div className={`mb-4 ${SUCCESS}`}>בדקו את תיבת הדואר — שלחנו קישור כניסה</div>
      )}

      {topError && <div className={`mb-4 ${ERROR}`}>{topError}</div>}

      {/* Google sign-in */}
      <form action={googleAction}>
        {next && <input type="hidden" name="next" value={next} />}
        <button type="submit" disabled={googlePending} className={SECONDARY_BUTTON}>
          <GoogleLogo />
          {googlePending ? 'מתחברים...' : 'כניסה עם Google'}
        </button>
      </form>

      {/*
        Passkey, directly under Google: renders only on browsers that support
        WebAuthn, and its failure path opens the magic-link form below, which
        is the fallback that works on every device and every account.
      */}
      <PasskeyLoginButton next={next} onFallback={openMagicFallback} />

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-500">או</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="דרך הכניסה"
          aria-orientation="horizontal"
          className="login-tabs mb-4 grid grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1"
          onKeyDown={onTabKey}
        >
          {tabs.map((key) => {
            const selected = key === tab
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={id(`tab-${key}`)}
                aria-selected={selected}
                aria-controls={id(`panel-${key}`)}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(key)}
                data-tab={key}
                className={`login-tab min-h-touch-min rounded-md px-3 text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-white text-heading shadow-sm'
                    : 'text-gray-600 hover:bg-white/60 hover:text-heading'
                }`}
              >
                {TAB_LABELS[key]}
              </button>
            )
          })}
        </div>
      )}

      {/* Email / password */}
      <div
        role={tabs.length > 1 ? 'tabpanel' : undefined}
        id={id('panel-email')}
        aria-labelledby={tabs.length > 1 ? id('tab-email') : undefined}
        hidden={tab !== 'email'}
        className="login-tabpanel"
      >
        <form action={emailAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}

          <div>
            <label htmlFor={id('email')} className="block text-sm font-medium text-gray-700 mb-1">
              אימייל
            </label>
            <input
              id={id('email')}
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              /*
                An address is Latin on a Hebrew page, so the FIELD is LTR while
                the form around it stays RTL - the same call `NewsletterSignup`,
                `ContactForm` and the signup phone input already make, and the
                reasoning is written out in the first of those. MEASURED before
                this line existed: `you@example.com` sat flush RIGHT here and
                flush LEFT on /contact, one address rendered two ways on one site.
              */
              dir="ltr"
              className={FIELD}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={id('password')} className="block text-sm font-medium text-gray-700">
                סיסמה
              </label>
              <Link
                href="/forgot-password"
                className="tap-area inline-flex items-center text-xs text-link hover:underline"
              >
                שכחתם סיסמה?
              </Link>
            </div>
            <input
              id={id('password')}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={FIELD}
            />
          </div>

          {getError(emailState) && <p className={ERROR}>{getError(emailState)}</p>}

          <button type="submit" disabled={emailPending} className={PRIMARY_BUTTON}>
            {emailPending ? 'מתחברים...' : 'כניסה'}
          </button>
        </form>
      </div>

      {/* SMS code. Hidden, not unmounted: a number typed here survives a look at the other tab. */}
      {phoneEnabled && (
        <div
          role="tabpanel"
          id={id('panel-phone')}
          aria-labelledby={id('tab-phone')}
          hidden={tab !== 'phone'}
          className="login-tabpanel"
        >
          <PhoneOtpForm next={next} idPrefix={`${idPrefix}-otp`} />
        </div>
      )}

      {/* Magic link */}
      <div className="mt-5">
        {!showMagic ? (
          <button
            type="button"
            onClick={() => setShowMagic(true)}
            className="login-magic-toggle w-full min-h-touch-min text-sm text-center text-gray-500 hover:text-link"
          >
            כניסה ללא סיסמה (קישור מאובטח לאימייל)
          </button>
        ) : (
          <form action={magicAction} className="space-y-3">
            <label htmlFor={id('magic-email')} className="block text-sm font-medium text-gray-700">
              אימייל לקישור כניסה
            </label>
            <input
              id={id('magic-email')}
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              dir="ltr"
              value={magicEmail}
              onChange={(event) => setMagicEmail(event.target.value)}
              className={FIELD}
            />
            {getSuccess(magicState) && <p className={SUCCESS}>{getSuccess(magicState)}</p>}
            {getError(magicState) && <p className={ERROR}>{getError(magicState)}</p>}
            <button type="submit" disabled={magicPending} className={OUTLINE_BUTTON}>
              {magicPending ? 'שולחים...' : 'שלחו לי קישור'}
            </button>
          </form>
        )}

        {/*
          The mail carries a six-digit code next to the link, for the case
          where it is read on a phone while the browser that asked is a
          laptop. Typing the code here signs that browser in without the
          link ever being clicked. Shown only once a mail is on its way.
        */}
        {getSuccess(magicState) && (
          <form action={codeAction} className="mt-4 space-y-3">
            <input type="hidden" name="email" value={magicEmail} />
            {next && <input type="hidden" name="next" value={next} />}
            <label htmlFor={id('magic-code')} className="block text-sm font-medium text-gray-700">
              או הזינו את הקוד מהמייל
            </label>
            <input
              id={id('magic-code')}
              name="token"
              type="text"
              required
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              placeholder="123456"
              className={CODE_FIELD}
            />
            {getError(codeState) && <p className={ERROR}>{getError(codeState)}</p>}
            <button type="submit" disabled={codePending} className={PRIMARY_BUTTON}>
              {codePending ? 'מאמתים...' : 'כניסה עם הקוד'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-gray-500">
        אין לכם חשבון?{' '}
        <Link
          href={signupHref}
          onClick={onSignupClick}
          className="text-link font-medium hover:underline"
        >
          הרשמה
        </Link>
      </p>
    </div>
  )
}
