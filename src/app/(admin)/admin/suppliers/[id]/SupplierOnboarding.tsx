'use client'

import {
  MEMBER_ROLES,
  MEMBER_ROLE_LABELS,
  type MemberRole,
  type OnboardingSummary,
} from '@/lib/admin/supplier-onboarding'
import { addSupplierMember, deactivateSupplierMember } from '@/server/actions/admin/suppliers'
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export interface MemberRow {
  user_id: string
  member_role: MemberRole
  is_active: boolean
  email: string | null
  full_name: string | null
}

export interface ProfileOption {
  id: string
  email: string | null
  full_name: string | null
}

interface Props {
  supplierId: string
  summary: OnboardingSummary
  members: MemberRow[]
  candidates: ProfileOption[]
}

/**
 * The onboarding checklist and the member list that was missing from it.
 *
 * A supplier with no active member cannot honour a voucher a customer has
 * already paid for, so "team access" is a blocking step here rather than an
 * optional extra.
 */
export default function SupplierOnboarding({
  supplierId,
  summary,
  members,
  candidates,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<MemberRole>('scanner')

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          קליטת ספק ({summary.doneCount} מתוך {summary.total})
        </h2>
        <span
          className={`text-xs font-medium ${summary.canTrade ? 'text-green-700' : 'text-amber-700'}`}
        >
          {summary.canTrade ? 'מוכן לפעילות' : 'חסום לפעילות'}
        </span>
      </div>

      <ol className="space-y-2">
        {summary.steps.map((step) => (
          <li key={step.key} className="flex items-start gap-2 text-sm">
            {step.done ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-600" />
            ) : step.blocking ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            ) : (
              <Circle size={16} className="mt-0.5 shrink-0 text-gray-300" />
            )}
            <div>
              <span className={step.done ? 'text-gray-500' : 'text-gray-800'}>{step.title}</span>
              {!step.done && step.todo && (
                <div className="text-xs text-gray-500 mt-0.5">{step.todo}</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">גישת צוות</h3>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        {members.length === 0 ? (
          <p className="text-sm text-gray-400 mb-3">אין משתמשים משויכים</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm mb-3">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between py-2">
                <div>
                  <div className={m.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}>
                    {m.full_name ?? m.email ?? m.user_id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {MEMBER_ROLE_LABELS[m.member_role]}
                    {!m.is_active && ' · הגישה בוטלה'}
                  </div>
                </div>
                {m.is_active && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deactivateSupplierMember(supplierId, m.user_id))}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    ביטול גישה
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="member-user" className="block text-xs font-medium text-gray-700 mb-1">
              משתמש
            </label>
            <select
              id="member-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">בחרו משתמש...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ? `${c.full_name} (${c.email})` : (c.email ?? c.id)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="member-role" className="block text-xs font-medium text-gray-700 mb-1">
              תפקיד
            </label>
            <select
              id="member-role"
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {MEMBER_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={pending || !userId}
            onClick={() => run(() => addSupplierMember(supplierId, userId, role))}
            className="bg-brand hover:bg-brand-primary-hover disabled:opacity-50 text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            {pending ? 'שומר...' : 'הוספה'}
          </button>
        </div>
      </div>
    </section>
  )
}
