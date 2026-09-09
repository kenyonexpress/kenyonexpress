import { t } from '@/lib/i18n/messages'
import type { TimelineStep } from '@/lib/shipping/timeline'

/**
 * The five steps, drawn as a vertical rail.
 *
 * VERTICAL, NOT HORIZONTAL, AND THAT IS A MEASUREMENT NOT A TASTE
 *
 * Five Hebrew labels laid out horizontally on a 380px phone leaves ~70px per
 * label, which wraps "בהכנה אצל הספק" onto three lines and shears the rail. The
 * vertical rail reads the same at 380 and at 1440, and the timestamps get a
 * full line each instead of being dropped at the narrow breakpoint.
 *
 * THE RAIL IS A FLEX COLUMN, NOT AN ABSOLUTE OFFSET
 *
 * The obvious build is `border-s` on the list plus a dot pulled onto it with a
 * negative inset. That inset is an arbitrary pixel value -- it has to equal the
 * padding plus half the dot minus the border -- and `src/styles/tokens.test.ts`
 * fails the build on arbitrary px for exactly this reason: the number is right
 * only until any of the three inputs changes, and then it is silently a pixel
 * off. Here the connector is a sibling of the dot inside a flex column, so it
 * lines up by construction and nothing needs recomputing.
 *
 * Nothing is directional: `gap` and `flex` flip with the document, so this is
 * correct in RTL without a single left/right rule.
 */

const DOT_BY_STATE: Record<TimelineStep['state'], string> = {
  done: 'bg-brand border-brand',
  current: 'bg-white border-brand ring-4 ring-brand/20',
  upcoming: 'bg-white border-heading/25',
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OrderTrackingTimeline({ steps }: { steps: readonly TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <li key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span
              className={`mt-1 block size-4 shrink-0 rounded-full border-2 ${DOT_BY_STATE[step.state]}`}
            />
            {index < steps.length - 1 && (
              <span
                className={`w-0.5 flex-1 ${step.state === 'done' ? 'bg-brand' : 'bg-heading/10'}`}
              />
            )}
          </div>
          <div className={index < steps.length - 1 ? 'pb-6' : ''}>
            <p
              className={
                step.state === 'upcoming'
                  ? 'text-sm text-heading/50'
                  : 'text-sm font-semibold text-heading'
              }
            >
              {step.labelHe}
              {/* The state is said in words as well as colour: a screen reader
                  gets nothing from a filled circle, and neither does anyone
                  with a colour vision deficiency. */}
              {step.state === 'current' && (
                <span className="ms-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-heading">
                  {t('orderTracking.nowBadge')}
                </span>
              )}
            </p>
            {step.at && (
              <time dateTime={step.at} className="mt-0.5 block text-xs text-heading/70">
                {formatStamp(step.at)}
              </time>
            )}
            {step.detailHe && <p className="mt-0.5 text-xs text-heading/60">{step.detailHe}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
