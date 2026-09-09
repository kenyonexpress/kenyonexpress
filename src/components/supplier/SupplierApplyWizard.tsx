'use client'

import { BANKS } from '@/lib/suppliers/bank-account'
import { checkCompanyId, companyIdMessage } from '@/lib/suppliers/company-id'
import {
  type OnboardingState,
  requestDocumentUpload,
  submitSupplierApplication,
} from '@/server/actions/supplier-onboarding'
import { useActionState, useId, useState } from 'react'

const EMPTY: OnboardingState = { ok: false }

/**
 * The onboarding wizard.
 *
 * THREE STEPS AND ONE SUBMIT. The steps exist so the form is not a wall of
 * thirteen fields, not so the data is saved in pieces: everything is posted
 * once, because a half-written application in the database is a row an operator
 * has to chase and a business number the unique index has already taken.
 * Documents are uploaded AFTER the application exists, which is the only part
 * that genuinely needs an id to attach to.
 *
 * THE COMPANY-ID CHECK RUNS IN THE BROWSER TOO, and the duplication is the
 * point: it is the same pure function the server calls, so a transposed digit
 * is caught while the certificate is still on the desk rather than after a
 * round trip. The server runs it again because nothing the browser says is
 * trusted.
 */

const STEPS = ['פרטי העסק', 'חשבון בנק', 'הסכם ומסמכים'] as const

const DOCUMENT_KINDS = [
  { value: 'business_certificate', label: 'תעודת התאגדות או אישור עוסק' },
  { value: 'bank_confirmation', label: 'אישור ניהול חשבון' },
  { value: 'vat_certificate', label: 'אישור ניכוי מס במקור' },
  { value: 'id_document', label: 'צילום תעודת זהות' },
  { value: 'insurance', label: 'אישור ביטוח' },
  { value: 'other', label: 'מסמך אחר' },
]

const field =
  'min-h-11 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-heading'

export default function SupplierApplyWizard({
  contractText,
  contractVersion,
}: {
  contractText: string
  contractVersion: string
}) {
  const [state, action, pending] = useActionState(submitSupplierApplication, EMPTY)
  const [step, setStep] = useState(0)
  const [businessId, setBusinessId] = useState('')
  const baseId = useId()

  const idCheck = businessId.trim() ? checkCompanyId(businessId) : null
  const idError = idCheck && !idCheck.ok ? companyIdMessage(idCheck) : null

  if (state.ok && state.applicationId) {
    return <DocumentStep applicationId={state.applicationId} message={state.message} />
  }

  return (
    <form action={action} className="mt-6 space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-lg px-3 py-1 ${index === step ? 'bg-brand font-semibold text-heading' : 'bg-gray-100 text-body'}`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {/* Every step stays mounted and only its visibility changes: unmounting
          would drop what was typed, and a wizard that loses step 1 when you
          reach step 3 is worse than one long form. */}
      <fieldset className={step === 0 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">פרטי העסק</legend>

        <div>
          <label htmlFor={`${baseId}-name`} className="mb-1 block text-sm font-medium">
            שם העסק
          </label>
          <input
            id={`${baseId}-name`}
            name="business_name"
            required
            maxLength={200}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-bid`} className="mb-1 block text-sm font-medium">
            ח&quot;פ / עוסק מורשה
          </label>
          <input
            id={`${baseId}-bid`}
            name="business_id"
            required
            inputMode="numeric"
            className={field}
            value={businessId}
            onChange={(event) => setBusinessId(event.target.value)}
            aria-describedby={idError ? `${baseId}-bid-error` : undefined}
          />
          {idError && (
            <p id={`${baseId}-bid-error`} className="mt-1 text-sm text-red-700">
              {idError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${baseId}-form`} className="mb-1 block text-sm font-medium">
            צורת התאגדות
          </label>
          <select id={`${baseId}-form`} name="legal_form" className={field} defaultValue="company">
            <option value="company">חברה בע&quot;מ</option>
            <option value="individual">עוסק מורשה / פטור</option>
            <option value="partnership">שותפות</option>
            <option value="association">עמותה</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${baseId}-contact`} className="mb-1 block text-sm font-medium">
            שם איש קשר
          </label>
          <input
            id={`${baseId}-contact`}
            name="contact_name"
            required
            maxLength={120}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-email`} className="mb-1 block text-sm font-medium">
            מייל
          </label>
          {/* Latin content inside an RTL form: without dir="ltr" an address
              renders with its parts reordered and the caret jumps on edit. */}
          <input
            id={`${baseId}-email`}
            name="email"
            type="email"
            dir="ltr"
            required
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-phone`} className="mb-1 block text-sm font-medium">
            טלפון
          </label>
          <input
            id={`${baseId}-phone`}
            name="phone"
            dir="ltr"
            required
            maxLength={20}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-city`} className="mb-1 block text-sm font-medium">
            עיר
          </label>
          <input id={`${baseId}-city`} name="city" required maxLength={80} className={field} />
        </div>

        <div>
          <label htmlFor={`${baseId}-address`} className="mb-1 block text-sm font-medium">
            כתובת (רשות)
          </label>
          <input id={`${baseId}-address`} name="address" maxLength={200} className={field} />
        </div>

        <div>
          <label htmlFor={`${baseId}-website`} className="mb-1 block text-sm font-medium">
            אתר (רשות)
          </label>
          <input
            id={`${baseId}-website`}
            name="website"
            dir="ltr"
            maxLength={200}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-category`} className="mb-1 block text-sm font-medium">
            תחום (רשות)
          </label>
          <input id={`${baseId}-category`} name="category" maxLength={80} className={field} />
        </div>
      </fieldset>

      <fieldset className={step === 1 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">חשבון בנק</legend>
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-body">
          מספר החשבון נשמר מוצפן ואינו נשמר כשדה גלוי. מה שצוות התפעול רואה הוא שם הבנק, הסניף וארבע
          הספרות האחרונות.
        </p>

        <div>
          <label htmlFor={`${baseId}-bank`} className="mb-1 block text-sm font-medium">
            בנק
          </label>
          <select id={`${baseId}-bank`} name="bank_code" required className={field} defaultValue="">
            <option value="" disabled>
              בחרו בנק
            </option>
            {BANKS.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.code} — {bank.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${baseId}-branch`} className="mb-1 block text-sm font-medium">
            סניף
          </label>
          <input
            id={`${baseId}-branch`}
            name="bank_branch"
            required
            inputMode="numeric"
            maxLength={3}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-account`} className="mb-1 block text-sm font-medium">
            מספר חשבון
          </label>
          <input
            id={`${baseId}-account`}
            name="bank_account"
            required
            inputMode="numeric"
            maxLength={12}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`${baseId}-holder`} className="mb-1 block text-sm font-medium">
            שם בעל החשבון
          </label>
          <input
            id={`${baseId}-holder`}
            name="bank_holder"
            required
            maxLength={120}
            className={field}
          />
        </div>
      </fieldset>

      <fieldset className={step === 2 ? 'space-y-4' : 'hidden'}>
        <legend className="sr-only">הסכם</legend>
        <input type="hidden" name="contract_version" value={contractVersion} />

        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-white p-4 text-sm text-body">
          {contractText}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept_contract" required className="mt-1" />
          <span>
            קראתי ואני מאשר/ת את הסכם הספק (גרסה {contractVersion}). האישור נרשם עם חתימת הטקסט
            המדויק שהוצג כאן.
          </span>
        </label>

        <p className="text-sm text-body">את המסמכים אפשר להעלות מיד אחרי השליחה.</p>
      </fieldset>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((current) => current - 1)}
            className="min-h-11 rounded-lg border px-4 py-2 text-sm"
          >
            חזרה
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((current) => current + 1)}
            className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold"
          >
            המשך
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {pending ? 'שולח...' : 'שליחת הבקשה'}
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Uploading the documents, once the application exists to attach them to.
 *
 * The PUT goes STRAIGHT TO R2 from the browser with a presigned URL, so a
 * ten-megabyte PDF never passes through the server. The row naming the object
 * is written before the URL is handed out, so a file that lands in a private
 * bucket always has something pointing at it.
 */
function DocumentStep({
  applicationId,
  message,
}: {
  applicationId: string
  message?: string
}) {
  const [kind, setKind] = useState(DOCUMENT_KINDS[0]?.value ?? 'other')
  const [status, setStatus] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const baseId = useId()

  async function upload(file: File) {
    setBusy(true)
    setStatus(null)
    try {
      const ticket = await requestDocumentUpload({
        application_id: applicationId,
        kind,
        content_type: file.type,
        bytes: file.size,
        original_name: file.name,
      })
      if (!ticket.ok) {
        setStatus(ticket.error)
        return
      }
      const response = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      })
      if (!response.ok) {
        // Named rather than swallowed: the row exists and the object does not,
        // which an operator sees as a document that will not open.
        setStatus('ההעלאה לאחסון נכשלה. נסו שוב.')
        return
      }
      setUploaded((current) => [...current, file.name])
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 space-y-4 rounded-lg border border-border bg-white p-5">
      <h2 className="text-lg font-semibold text-heading">מסמכים</h2>
      {message && <output className="block text-sm text-green-700">{message}</output>}

      <div>
        <label htmlFor={`${baseId}-kind`} className="mb-1 block text-sm font-medium">
          סוג המסמך
        </label>
        <select
          id={`${baseId}-kind`}
          className={field}
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          {DOCUMENT_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${baseId}-file`} className="mb-1 block text-sm font-medium">
          קובץ (PDF או תמונה, עד 10MB)
        </label>
        <input
          id={`${baseId}-file`}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          className={field}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </div>

      {status && (
        <p role="alert" className="text-sm text-red-700">
          {status}
        </p>
      )}

      {uploaded.length > 0 && (
        <ul className="list-inside list-disc text-sm text-body">
          {uploaded.map((name) => (
            <li key={name}>{name} הועלה</li>
          ))}
        </ul>
      )}
    </section>
  )
}
