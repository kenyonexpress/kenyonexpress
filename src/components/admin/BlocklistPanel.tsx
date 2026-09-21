'use client'

import { BLOCKLIST_KINDS, BLOCKLIST_KIND_LABEL_HE } from '@/lib/fraud/blocklist'
import {
  type FraudActionState,
  addBlocklistEntry,
  removeBlocklistEntry,
} from '@/server/actions/admin/fraud'
import { useActionState } from 'react'

const EMPTY: FraudActionState = null

type Entry = {
  id: string
  kind: string
  value: string
  reason: string
  expiresAt: string | null
  createdAt: string
}

function Feedback({ state }: { state: FraudActionState }) {
  if (!state) return null
  if ('error' in state) return <output className="block text-sm text-red-700">{state.error}</output>
  return <output className="block text-sm text-green-700">{state.success}</output>
}

function RemoveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(removeBlocklistEntry, EMPTY)
  if (state && 'success' in state) return <span className="text-sm text-gray-500">הוסר</span>
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        type="text"
        name="note"
        maxLength={500}
        placeholder="סיבת הסרה (רשות)"
        className="min-h-11 w-44 rounded-lg border px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        הסרה
      </button>
      <Feedback state={state} />
    </form>
  )
}

export default function BlocklistPanel({ entries }: { entries: Entry[] }) {
  const [state, action, pending] = useActionState(addBlocklistEntry, EMPTY)
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-5">
        <label className="text-xs text-gray-600">
          סוג
          <select name="kind" className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm">
            {BLOCKLIST_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {BLOCKLIST_KIND_LABEL_HE[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 md:col-span-2">
          ערך
          <input
            name="value"
            required
            dir="ltr"
            className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          סיבה
          <input
            name="reason"
            required
            minLength={3}
            maxLength={500}
            className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600">
          תוקף בימים (ריק = ללא)
          <input
            name="expires_days"
            inputMode="numeric"
            dir="ltr"
            className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm"
          />
        </label>
        <div className="md:col-span-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            חסימה
          </button>
          <Feedback state={state} />
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          רשימת החסימה ריקה.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3"
            >
              <div className="min-w-0 text-sm">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                  {BLOCKLIST_KIND_LABEL_HE[entry.kind as keyof typeof BLOCKLIST_KIND_LABEL_HE] ??
                    entry.kind}
                </span>
                <span dir="ltr" className="ms-2 font-mono">
                  {entry.value}
                </span>
                <p className="mt-1 text-gray-600">{entry.reason}</p>
                <p className="text-xs text-gray-400">
                  {entry.expiresAt ? `עד ${entry.expiresAt.slice(0, 10)}` : 'ללא תוקף'}
                </p>
              </div>
              <RemoveButton id={entry.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
