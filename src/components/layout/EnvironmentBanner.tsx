import { deployEnvironment, shouldShowEnvironmentBanner } from '@/lib/deploy-environment'
import { t } from '@/lib/i18n/messages'

/**
 * A ribbon saying this is not the shop.
 *
 * WHAT IT IS FOR. A staging deployment is a pixel-for-pixel copy of production
 * serving different data, and the only thing distinguishing them in a browser
 * is a hostname nobody reads. The failure it prevents is small and expensive:
 * a real card typed into a sandbox checkout, an operator editing a product that
 * will be thrown away, or a screenshot of test data that reaches a supplier as
 * though it were their sales.
 *
 * A SERVER COMPONENT, so `VERCEL_ENV` decides -- see `lib/deploy-environment`
 * for why the platform's own per-deployment value is used rather than a
 * variable somebody sets. It renders nothing at all in production, so the
 * production bundle carries a component that returns null and no copy.
 *
 * ABOVE EVERYTHING AND IN FLOW, not fixed. A fixed ribbon overlaps the header
 * on a phone and has to be dismissible, and a dismissible warning is one that
 * is dismissed once and never seen again on the environment it exists for.
 * Costing 28px at the top of a staging page is the whole point.
 *
 * The copy comes from the catalog rather than being a literal, which is what
 * the i18n ratchet asks of new components and is why the ceiling did not move
 * for this one.
 */
export default function EnvironmentBanner() {
  if (!shouldShowEnvironmentBanner()) return null
  const environment = deployEnvironment()

  return (
    // `<output>` rather than `<div role="status">`: the element carries the
    // role implicitly, and biome's a11y rule refuses the explicit form for
    // exactly that reason. NOT `role="alert"` in any spelling -- an alert
    // interrupts a screen reader mid-sentence on every page load, and this is a
    // standing condition of the deployment rather than an event that just
    // happened.
    <output
      dir="rtl"
      className="block w-full bg-amber-400 px-4 py-1.5 text-center font-semibold text-amber-950 text-xs"
    >
      <span className="me-1.5 rounded bg-amber-950 px-1.5 py-0.5 text-amber-50 text-xs uppercase">
        {environment}
      </span>
      {t(environment === 'local' ? 'environment.local' : 'environment.preview')}
    </output>
  )
}
