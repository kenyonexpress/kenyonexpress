import SupportStatusBadge from '@/components/contact/SupportStatusBadge'
import { SUPPORT_HOURS_ROWS, SUPPORT_RESPONSE } from '@/lib/support-hours'

/**
 * The hours a person answers, and what to expect after writing (STEP 52).
 *
 * Every string here comes from `lib/support-hours`, which is also what the
 * badge computes from and what the page's `ContactPoint` declares, so the
 * three cannot describe three different weeks. The table is static and
 * prerenders; only the badge reads a clock, in the browser.
 */
export default function SupportHours() {
  return (
    <section
      aria-labelledby="support-hours"
      className="rounded-xl border border-heading/15 bg-heading/5 p-5"
    >
      <h2 id="support-hours" className="text-lg font-bold text-heading">
        שעות מענה
      </h2>
      <p className="mt-1 text-sm text-heading/75">לפי שעון ישראל</p>

      <SupportStatusBadge className="mt-3" />

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base text-heading/85">
        {SUPPORT_HOURS_ROWS.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium text-heading">{row.label}</dt>
            <dd className="tabular-nums">{row.hours}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-base font-bold text-heading">מתי נחזור אליכם</h3>
      <ul className="mt-2 space-y-1.5 text-base leading-relaxed text-heading/85">
        <li>{SUPPORT_RESPONSE.whatsapp}</li>
        <li>{SUPPORT_RESPONSE.form}</li>
        <li>{SUPPORT_RESPONSE.afterHours}</li>
      </ul>
    </section>
  )
}
