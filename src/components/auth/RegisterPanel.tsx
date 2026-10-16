'use client'

import { GoogleLogo } from '@/components/shared/GoogleLogo'
import { isPlainActivation } from '@/lib/auth/login-dialog'
import { maskPhone } from '@/lib/auth/phone-otp'
import {
  type DetailsIssues,
  type PhoneStepIssues,
  REGISTER_STEPS,
  REGISTER_STEP_LABELS,
  type RegisterStep,
  detailsIssues,
  firstNameOf,
  phoneStepIssues,
  stepAnnouncement,
  stepForField,
  stepIndex,
  stepStates,
} from '@/lib/auth/register-steps'
import { TERMS_ACCEPT_FIELD } from '@/lib/auth/terms-acceptance'
import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import { type RegisterState, registerAccount, verifyRegisterPhone } from '@/server/actions/register'
import { resendSignupPhoneOtp } from '@/server/actions/signup-phone'
import Link from 'next/link'
import { type FormEvent, type MouseEvent, useActionState, useEffect, useRef, useState } from 'react'

/**
 * The register stepper (UX24), one body for the /signup page and the auth
 * dialog, the way LoginPanel is one body for /login and the same dialog.
 *
 * MEASURED BEFORE (logs/ux24/before.json, the build of 43738bf43 at 380 /
 * 768 / 1440): the dialog's הרשמה link left the page for /signup at every
 * width; /signup was one form of four fields and two buttons (Google 42px,
 * הרשמה 40px) with no terms control at all, and an account could be created
 * without ever seeing the תקנון. The phone code lived on a second page
 * (/signup/verify-phone) reached by a redirect, and the end was a third
 * (/signup/confirm).
 *
 * FOUR STEPS, ONE FORM. Steps one and two (פרטים; טלפון ותנאים) are two
 * sections of the SAME form, the inactive one `hidden`: the first advances
 * on the client against the same zod schema the server applies, and the
 * second posts everything. The form is `noValidate` so a `required` field in
 * the hidden section can never block the submit with a bubble nobody can
 * see, and so the sentences are ours and the same on both sides. A server
 * error that names a field sends the stepper back to the step that holds it.
 * Step three is the six digits, shown only when a code actually went out
 * (today no deployment has an SMS sender, so the step is marked skipped);
 * step four is the welcome, with the mail on its way.
 *
 * THE STEPPER IS AN <ol>. One `aria-current="step"`, a `data-state` per
 * step for the stylesheet, a polite live region that says "שלב N מתוך 4",
 * and focus moved onto the step's heading on every change so a screen
 * reader lands on the new step instead of a vanished button.
 *
 * TERMS. The box is unticked by default (a pre-ticked consent is no
 * consent), links to the תקנון and the privacy policy open in a new tab so
 * the typed form is not lost, and the acceptance is recorded on the account
 * with the versions in force (server/auth/terms-record.ts).
 */

const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent'
const FIELD_INVALID = 'border-red-400 focus:ring-red-300'
const CODE_FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent'
const SECONDARY_BUTTON =
  'w-full flex min-h-touch-min items-center justify-center gap-2 border border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60'
const PRIMARY_BUTTON =
  'w-full min-h-touch-min bg-brand text-heading hover:bg-brand-dark hover:text-white disabled:opacity-60 font-semibold rounded-lg py-2 text-sm transition-colors'
const GHOST_BUTTON =
  'w-full min-h-touch-min text-sm font-medium text-gray-600 hover:text-heading rounded-lg transition-colors'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const ERROR = 'text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2'
const SUCCESS = 'text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2'
const FIELD_ERROR = 'mt-1 text-xs text-red-600'

function getError(state: AuthState): string | null {
  return state && 'error' in state ? state.error : null
}

export interface RegisterPanelProps {
  next?: string
  /** `page` is the /signup card; `dialog` is the same body inside the auth dialog. */
  variant?: 'page' | 'dialog'
  /** Inside the dialog: "כבר יש לכם חשבון? כניסה" switches to the login body in place. */
  onLogin?: () => void
  /** Inside the dialog: the welcome's "המשך לגלוש" closes it. */
  onDone?: () => void
}

export default function RegisterPanel({
  next,
  variant = 'page',
  onLogin,
  onDone,
}: RegisterPanelProps) {
  const idPrefix = variant === 'dialog' ? 'register-dialog' : 'register'
  const id = (name: string) => `${idPrefix}-${name}`

  const [step, setStep] = useState<RegisterStep>('details')
  const [phoneSkipped, setPhoneSkipped] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState(false)
  const [issues, setIssues] = useState<DetailsIssues & PhoneStepIssues>({})
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(
    signInWithGoogle,
    null,
  )
  const [registerState, registerAction, registerPending] = useActionState<RegisterState, FormData>(
    registerAccount,
    null,
  )
  const [verifyState, verifyAction, verifyPending] = useActionState<RegisterState, FormData>(
    verifyRegisterPhone,
    null,
  )
  const [resendState, resendAction, resendPending] = useActionState<AuthState, FormData>(
    resendSignupPhoneOtp,
    null,
  )

  // The server's answer moves the stepper: forward to the code or the
  // welcome, or back to the step whose field it refused.
  useEffect(() => {
    if (!registerState) return
    if ('error' in registerState) {
      setStep(stepForField(registerState.field))
      return
    }
    if (registerState.step === 'welcome') setPhoneSkipped(true)
    setStep(registerState.step)
  }, [registerState])

  useEffect(() => {
    if (verifyState && 'step' in verifyState) setStep(verifyState.step)
  }, [verifyState])

  // Focus the new step's heading on every change after the first render.
  const focusedStep = useRef<RegisterStep>(step)
  useEffect(() => {
    if (focusedStep.current === step) return
    focusedStep.current = step
    headingRef.current?.focus()
  }, [step])

  const states = stepStates(step, phoneSkipped)
  const outcome =
    verifyState && 'step' in verifyState
      ? verifyState
      : registerState && 'step' in registerState
        ? registerState
        : null
  const verifyingPhone = outcome?.step === 'verify' ? outcome.phone : null
  const outcomeEmail = outcome?.email ?? email
  const phoneVerified = outcome?.step === 'welcome' && outcome.phoneVerified
  const serverError =
    registerState && 'error' in registerState && stepForField(registerState.field) === step
      ? registerState.error
      : null

  function advance() {
    const found = detailsIssues({ full_name: fullName, email, password })
    setIssues(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(id(Object.keys(found)[0] as string))?.focus()
      return
    }
    setStep('phone')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (step === 'details') {
      event.preventDefault()
      advance()
      return
    }
    const found = phoneStepIssues({ phone, accept_terms: terms })
    setIssues(found)
    if (Object.keys(found).length > 0) {
      event.preventDefault()
      document.getElementById(id(Object.keys(found)[0] as string))?.focus()
    }
  }

  function back() {
    setIssues({})
    setStep('details')
  }

  function skipPhone() {
    setPhoneSkipped(true)
    setStep('welcome')
  }

  function onLoginClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!onLogin || !isPlainActivation(event)) return
    event.preventDefault()
    onLogin()
  }

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'
  const invalid = (name: keyof typeof issues) => (issues[name] ? 'true' : undefined)
  const describedBy = (name: keyof typeof issues) =>
    issues[name] ? id(`${name}-error`) : undefined

  return (
    <div className="register-panel" data-variant={variant} data-step={step}>
      <ol className="register-steps" aria-label="שלבי ההרשמה">
        {REGISTER_STEPS.map((key) => (
          <li
            key={key}
            className="register-steps__item"
            data-state={states[key]}
            aria-current={states[key] === 'current' ? 'step' : undefined}
          >
            <span className="register-steps__num" aria-hidden="true">
              {states[key] === 'done' ? '✓' : stepIndex(key) + 1}
            </span>
            <span className="register-steps__label">{REGISTER_STEP_LABELS[key]}</span>
          </li>
        ))}
      </ol>
      <output className="sr-only" aria-live="polite">
        {stepAnnouncement(step)}
      </output>

      <h3 ref={headingRef} tabIndex={-1} className="register-panel__step-title">
        {step === 'welcome'
          ? `ברוכים הבאים${fullName ? `, ${firstNameOf(fullName)}` : ''}!`
          : REGISTER_STEP_LABELS[step]}
      </h3>

      {/* Step one only: Google creates the account in one press. */}
      {step === 'details' && (
        <>
          {getError(googleState) && <div className={`mb-4 ${ERROR}`}>{getError(googleState)}</div>}
          <form action={googleAction}>
            {next && <input type="hidden" name="next" value={next} />}
            <button type="submit" disabled={googlePending} className={SECONDARY_BUTTON}>
              <GoogleLogo />
              {googlePending ? 'מתחברים...' : 'הרשמה עם Google'}
            </button>
          </form>
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-500">או</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
        </>
      )}

      {/* Steps one and two: one form, two sections. */}
      <form
        action={registerAction}
        onSubmit={onSubmit}
        noValidate
        hidden={step !== 'details' && step !== 'phone'}
        className="register-form"
        aria-label="יצירת חשבון"
      >
        {next && <input type="hidden" name="next" value={next} />}

        <fieldset hidden={step !== 'details'} className="register-step space-y-4">
          <legend className="sr-only">פרטים</legend>
          <div>
            <label htmlFor={id('full_name')} className={LABEL}>
              שם מלא
            </label>
            <input
              id={id('full_name')}
              name="full_name"
              type="text"
              autoComplete="name"
              placeholder="ישראל ישראלי"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              aria-invalid={invalid('full_name')}
              aria-describedby={describedBy('full_name')}
              className={`${FIELD} ${issues.full_name ? FIELD_INVALID : ''}`}
            />
            {issues.full_name && (
              <p id={id('full_name-error')} className={FIELD_ERROR}>
                {issues.full_name}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={id('email')} className={LABEL}>
              אימייל
            </label>
            <input
              id={id('email')}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={invalid('email')}
              aria-describedby={describedBy('email')}
              className={`${FIELD} ${issues.email ? FIELD_INVALID : ''}`}
            />
            {issues.email && (
              <p id={id('email-error')} className={FIELD_ERROR}>
                {issues.email}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={id('password')} className={LABEL}>
              סיסמה
            </label>
            <input
              id={id('password')}
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="לפחות 8 תווים + ספרה"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={invalid('password')}
              aria-describedby={describedBy('password')}
              className={`${FIELD} ${issues.password ? FIELD_INVALID : ''}`}
            />
            {issues.password && (
              <p id={id('password-error')} className={FIELD_ERROR}>
                {issues.password}
              </p>
            )}
          </div>
          {serverError && step === 'details' && <p className={ERROR}>{serverError}</p>}
          <button type="button" onClick={advance} className={PRIMARY_BUTTON}>
            המשך
          </button>
        </fieldset>

        <fieldset hidden={step !== 'phone'} className="register-step space-y-4">
          <legend className="sr-only">טלפון ותנאים</legend>
          <div>
            <label htmlFor={id('phone')} className={LABEL}>
              טלפון נייד
            </label>
            <input
              id={id('phone')}
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="050-1234567"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={invalid('phone')}
              aria-describedby={issues.phone ? id('phone-error') : id('phone-hint')}
              className={`${FIELD} text-start ${issues.phone ? FIELD_INVALID : ''}`}
            />
            {issues.phone ? (
              <p id={id('phone-error')} className={FIELD_ERROR}>
                {issues.phone}
              </p>
            ) : (
              <p id={id('phone-hint')} className="mt-1 text-xs text-gray-500">
                מספר ישראלי (050, 052, 054 וכו׳). נשלח אליו קוד אימות ב-SMS כשהשירות זמין.
              </p>
            )}
          </div>

          <div className="register-terms">
            <input
              id={id('accept_terms')}
              name={TERMS_ACCEPT_FIELD}
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              aria-invalid={invalid('accept_terms')}
              aria-describedby={describedBy('accept_terms')}
              className="register-terms__box"
            />
            <label htmlFor={id('accept_terms')} className="register-terms__label">
              קראתי ואני מאשר/ת את{' '}
              <Link href="/terms-and-conditions" target="_blank" rel="noopener">
                תנאי השימוש
              </Link>{' '}
              ואת{' '}
              <Link href="/privacy-policy" target="_blank" rel="noopener">
                מדיניות הפרטיות
              </Link>
            </label>
          </div>
          {issues.accept_terms && (
            <p id={id('accept_terms-error')} className={FIELD_ERROR} role="alert">
              {issues.accept_terms}
            </p>
          )}

          {serverError && step === 'phone' && <p className={ERROR}>{serverError}</p>}

          <button type="submit" disabled={registerPending} className={PRIMARY_BUTTON}>
            {registerPending ? 'יוצרים חשבון...' : 'יצירת חשבון'}
          </button>
          <button type="button" onClick={back} className={GHOST_BUTTON}>
            חזרה לפרטים
          </button>
        </fieldset>
      </form>

      {/* Step three: the six digits. Rendered only once a code went out. */}
      {step === 'verify' && verifyingPhone && (
        <div className="register-step space-y-4">
          <p className="text-sm text-gray-500">
            שלחנו קוד בן 6 ספרות ב-SMS למספר{' '}
            <span dir="ltr" className="font-medium text-gray-700">
              {maskPhone(verifyingPhone)}
            </span>
            . הזינו אותו כאן כדי להמשיך.
          </p>
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="phone" value={verifyingPhone} />
            <input type="hidden" name="email" value={outcomeEmail} />
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label htmlFor={id('otp')} className={LABEL}>
                קוד האימות
              </label>
              <input
                id={id('otp')}
                name="token"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                dir="ltr"
                placeholder="123456"
                className={CODE_FIELD}
              />
            </div>
            {verifyState && 'error' in verifyState && <p className={ERROR}>{verifyState.error}</p>}
            <button type="submit" disabled={verifyPending} className={PRIMARY_BUTTON}>
              {verifyPending ? 'מאמתים...' : 'אימות'}
            </button>
          </form>
          <form action={resendAction}>
            <input type="hidden" name="phone" value={verifyingPhone} />
            {getError(resendState) && <p className={`mb-2 ${ERROR}`}>{getError(resendState)}</p>}
            {resendState && 'success' in resendState && (
              <p className={`mb-2 ${SUCCESS}`}>שלחנו קוד חדש</p>
            )}
            <button type="submit" disabled={resendPending} className={SECONDARY_BUTTON}>
              {resendPending ? 'שולחים...' : 'לא קיבלתי קוד, שלחו שוב'}
            </button>
          </form>
          <button type="button" onClick={skipPhone} className={GHOST_BUTTON}>
            דלגו בינתיים, אאמת מהאזור האישי
          </button>
        </div>
      )}

      {/* Step four: the welcome. */}
      {step === 'welcome' && (
        <div className="register-welcome" data-testid="register-welcome">
          <svg
            className="register-welcome__mark"
            viewBox="0 0 64 64"
            width="64"
            height="64"
            aria-hidden="true"
            focusable="false"
          >
            <circle className="register-welcome__ring" cx="32" cy="32" r="28" />
            <path className="register-welcome__check" d="M20 33 L28 41 L44 24" />
          </svg>
          <span className="register-welcome__confetti" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <p className="register-welcome__text">
            החשבון נוצר. שלחנו קישור אימות אל{' '}
            <span dir="ltr" className="font-medium text-gray-700">
              {outcomeEmail}
            </span>
            . לחצו עליו כדי להפעיל את החשבון.
          </p>
          {phoneVerified ? (
            <p className={SUCCESS}>מספר הטלפון אומת בהצלחה</p>
          ) : (
            <p className="text-xs text-gray-500">אפשר לאמת את מספר הטלפון אחר כך מהאזור האישי.</p>
          )}
          <div className="register-welcome__actions">
            {variant === 'dialog' ? (
              <button type="button" onClick={onDone} className={PRIMARY_BUTTON}>
                המשך לגלוש
              </button>
            ) : (
              <Link
                href={next ?? '/'}
                className={`${PRIMARY_BUTTON} inline-grid place-items-center`}
              >
                המשך לגלוש
              </Link>
            )}
            <Link
              href={loginHref}
              onClick={onLoginClick}
              className={`${GHOST_BUTTON} inline-grid place-items-center`}
            >
              לכניסה
            </Link>
          </div>
        </div>
      )}

      {step !== 'welcome' && (
        <p className="mt-5 text-center text-sm text-gray-500">
          כבר יש לכם חשבון?{' '}
          <Link
            href={loginHref}
            onClick={onLoginClick}
            className="text-link font-medium hover:underline"
          >
            כניסה
          </Link>
        </p>
      )}
    </div>
  )
}
