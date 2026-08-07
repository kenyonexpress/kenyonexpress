'use client'

import { generatePayoutStatement } from '@/server/actions/admin/payouts'
import { Play } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

interface Props {
  suppliers: { id: string; name: string; min_payout_ils: string | number | null }[]
  /** Previous whole calendar month, the period a run is almost always for. */
  defaultStart: string
  defaultEnd: string
}

export default function GeneratePayoutClient({ suppliers, defaultStart, defaultEnd }: Props) {
  const [pending, startTransition] = useTransition()
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [periodStart, setPeriodStart] = useState(defaultStart)
  const [periodEnd, setPeriodEnd] = useState(defaultEnd)

  const selected = suppliers.find((s) => s.id === supplierId)

  function handleRun() {
    startTransition(async () => {
      const result = await generatePayoutStatement({ supplierId, periodStart, periodEnd })
      if (result.error) toast.error(result.error)
      // A rollover is a successful run with nothing to pay, and the action says
      // so in its message. Toasting it as an error would train the admin to
      // treat the minimum-payout rule as a failure.
      else toast.success(result.success ?? 'הריצה הסתיימה')
    })
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-900">ריצת תשלום חדשה</h2>
      <p className="mt-1 text-xs text-gray-500">
        אוספת שורות פיזיות שנמסרו בתקופה ועברו 3 ימי עסקים מהמסירה, לפי הפיצול שצולם בזמן ההזמנה.
        קופון אינו מייצר שורה: כל המקדמה נשארת בפלטפורמה והספק גובה את היתרה בבית העסק.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          ספק
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="min-w-52 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-600">
          מתאריך
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-gray-600">
          עד תאריך
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>

        <button
          type="button"
          onClick={handleRun}
          disabled={pending || !supplierId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-50"
        >
          <Play size={14} />
          הרץ
        </button>
      </div>

      {selected && (
        <p className="mt-2 text-xs text-gray-500">
          מינימום לתשלום אצל {selected.name}: ‏{Number(selected.min_payout_ils ?? 100)} ש"ח. מתחת
          לסכום הזה הריצה מתגלגלת והשורות נאספות בפעם הבאה.
        </p>
      )}
    </div>
  )
}
