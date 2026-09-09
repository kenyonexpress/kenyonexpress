'use client'

import {
  type ApplicationActionState,
  decideSupplierApplication,
} from '@/server/actions/admin/supplier-applications'
import { useActionState } from 'react'

const EMPTY: ApplicationActionState = null

const LEGAL_FORMS: Record<string, string> = {
  company: 'חברה בע"מ',
  individual: 'עוסק מורשה / פטור',
  partnership: 'שותפות',
  association: 'עמותה',
}

const DOCUMENT_LABELS: Record<string, string> = {
  business_certificate: 'תעודת התאגדות / אישור עוסק',
  bank_confirmation: 'אישור ניהול חשבון',
  vat_certificate: 'אישור ניכוי מס',
  id_document: 'תעודת זהות',
  insurance: 'ביטוח',
  other: 'אחר',
}

/**
 * One application awaiting a decision.
 *
 * THE TWO REQUIRED DOCUMENTS ARE CALLED OUT BY ABSENCE. A checklist that only
 * lists what was uploaded makes a missing bank confirmation invisible - the
 * operator sees three documents and approves. Naming the gap is what turns the
 * list into a decision aid.
 *
 * REJECTION REQUIRES A REASON, in the form and in the database CHECK, because
 * the applicant is TOLD this text. "No" with no reason is what the second
 * application is made of.
 */
export default function ApplicationReviewRow(props: {
  id: string
  businessName: string
  businessId: string
  legalForm: string
  contactName: string
  email: string
  phone: string
  city: string
  website: string | null
  category: string | null
  status: string
  submittedAt: string | null
  bankLine: string | null
  documents: Array<{ kind: string; name: string | null }>
}) {
  const [state, action, pending] = useActionState(decideSupplierApplication, EMPTY)

  if (state && 'success' in state) {
    return (
      <li className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
        {props.businessName}, {state.success}
      </li>
    )
  }

  const kinds = new Set(props.documents.map((document) => document.kind))
  const missing = (['business_certificate', 'bank_confirmation'] as const).filter(
    (kind) => !kinds.has(kind),
  )

  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{props.businessName}</span>
        <span className="text-sm">{LEGAL_FORMS[props.legalForm] ?? props.legalForm}</span>
        <span className="text-sm text-gray-600">
          ח&quot;פ <bdi>{props.businessId}</bdi>
        </span>
        <span className="text-sm">{props.status === 'in_review' ? 'בבדיקה' : 'ממתינה'}</span>
        {props.submittedAt && (
          <span className="text-sm text-gray-500">
            הוגשה {new Date(props.submittedAt).toLocaleDateString('he-IL')}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-gray-700">
        {props.contactName} · {props.email} · {props.phone} · {props.city}
        {props.category ? ` · ${props.category}` : ''}
        {props.website ? ` · ${props.website}` : ''}
      </p>

      <p className="mt-1 text-sm text-gray-700">{props.bankLine ?? 'לא נמסרו פרטי בנק.'}</p>

      <div className="mt-2 text-sm">
        <span className="font-medium">מסמכים: </span>
        {props.documents.length === 0 ? (
          <span className="text-gray-600">לא הועלו מסמכים.</span>
        ) : (
          <span className="text-gray-700">
            {props.documents
              .map((document) => DOCUMENT_LABELS[document.kind] ?? document.kind)
              .join(', ')}
          </span>
        )}
      </div>

      {missing.length > 0 && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
          חסר: {missing.map((kind) => DOCUMENT_LABELS[kind]).join(', ')}
        </p>
      )}

      <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={props.id} />
        <input
          type="text"
          name="note"
          maxLength={2000}
          placeholder="נימוק (חובה לדחייה, נשלח למבקש)"
          className="min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        {props.status === 'submitted' && (
          <button
            type="submit"
            name="decision"
            value="in_review"
            disabled={pending}
            className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            סימון כבבדיקה
          </button>
        )}
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="min-h-11 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          אישור ויצירת ספק
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="min-h-11 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          דחייה
        </button>
      </form>

      {state && 'error' in state && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </li>
  )
}
