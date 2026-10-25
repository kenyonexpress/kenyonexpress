'use client'

/**
 * Admin dashboard charts for revenue and orders over time.
 * Shows last 7, 30, and 90 days with simple bar charts.
 */

import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { useState } from 'react'

interface DayData {
  date: string
  orders: number
  revenue: number // agorot
}

interface ChartsProps {
  days7: DayData[]
  days30: DayData[]
  days90: DayData[]
}

type Period = '7' | '30' | '90'

export default function DashboardCharts({ days7, days30, days90 }: ChartsProps) {
  const [period, setPeriod] = useState<Period>('7')

  const data = period === '7' ? days7 : period === '30' ? days30 : days90
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1)
  const maxOrders = Math.max(...data.map((d) => d.orders), 1)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">גרפים</h2>
        <div className="flex gap-2 text-xs">
          {(['7', '30', '90'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                period === p
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p} ימים
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue chart */}
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-gray-700">הכנסות</h3>
          <div className="flex h-48 items-end gap-1">
            {data.map((day) => {
              const heightPct = (day.revenue / maxRevenue) * 100
              return (
                <div key={day.date} className="group relative flex-1" style={{ minWidth: '4px' }}>
                  <div
                    className="w-full rounded-t-sm bg-brand-primary/80 transition-all group-hover:bg-brand-primary"
                    style={{ height: `${heightPct}%` }}
                    title={`${new Date(day.date).toLocaleDateString('he-IL')}: ${shekels(agorot(day.revenue))}`}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-full mb-2 hidden flex-col items-center group-hover:flex">
                    <div className="whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
                      {new Date(day.date).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      <br />
                      {shekels(agorot(day.revenue))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Orders chart */}
        <div className="rounded-xl border border-black/10 bg-white p-5">
          <h3 className="mb-4 text-sm font-medium text-gray-700">הזמנות</h3>
          <div className="flex h-48 items-end gap-1">
            {data.map((day) => {
              const heightPct = (day.orders / maxOrders) * 100
              return (
                <div key={day.date} className="group relative flex-1" style={{ minWidth: '4px' }}>
                  <div
                    className="w-full rounded-t-sm bg-green-500/80 transition-all group-hover:bg-green-500"
                    style={{ height: `${heightPct}%` }}
                    title={`${new Date(day.date).toLocaleDateString('he-IL')}: ${day.orders} הזמנות`}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-full mb-2 hidden flex-col items-center group-hover:flex">
                    <div className="whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
                      {new Date(day.date).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      <br />
                      {day.orders} הזמנות
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
