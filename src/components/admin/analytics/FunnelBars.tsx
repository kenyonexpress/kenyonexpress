import type { FunnelStep } from '@/lib/analytics/aggregate'

// Conversion funnel. Horizontal bars because the labels are Hebrew phrases that
// do not fit under a column, and because a funnel is read top to bottom.
//
// Every step shows its conversion from the previous one: that is the number
// that tells you where to work. A step whose predecessor had no traffic shows a
// dash, not 0%, because "no data" is not "nobody converted".

function formatInt(value: number): string {
  return value.toLocaleString('he-IL')
}

export default function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.value ?? 0

  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        const width = top > 0 ? Math.max((step.value / top) * 100, step.value > 0 ? 1 : 0) : 0

        return (
          <li key={step.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-black/70">{step.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-medium text-heading">{formatInt(step.value)}</span>
                <span className="text-xs text-black/40">
                  {step.fromPreviousPct === null ? '—' : `${step.fromPreviousPct}% מהשלב הקודם`}
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded bg-[#f1f2f4]">
              <div
                className="h-2 rounded bg-heading/80"
                style={{ width: `${width}%` }}
                title={`${step.label}: ${formatInt(step.value)}`}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
