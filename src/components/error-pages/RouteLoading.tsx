import { t } from '@/lib/i18n/messages'
import '@/styles/route-loading.css'

/**
 * The one loading state behind every route group's `loading.tsx` (S33,
 * 06.11.2026).
 *
 * No hooks, no data, no imports from the storefront chrome: a `loading.tsx` is
 * the fallback of a Suspense boundary Next puts between a layout and its page,
 * so it renders inside whatever frame the group already has (header and footer
 * in the store, the side nav in the account, the panel in admin and supplier)
 * and must not bring a second one.
 *
 * The status role with the label as its text is what a screen reader hears.
 * The ring and the bones are decoration and are hidden from it.
 *
 * `panel` is for frames that already hold their own height. The default holds
 * 60vh so the footer does not jump (see route-loading.css).
 */
export default function RouteLoading({
  panel = false,
  label,
}: {
  panel?: boolean
  label?: string
}) {
  return (
    // `<output>` rather than `<div role="status">`: the element carries the
    // role and the polite live region itself. Its content model is phrasing,
    // so everything inside is a <span> and the sheet makes the boxes.
    <output
      dir="rtl"
      data-testid="route-loading"
      className={panel ? 'ke-route-loading ke-route-loading--panel' : 'ke-route-loading'}
    >
      <span className="ke-route-loading__ring" aria-hidden="true" />
      <span className="ke-route-loading__label">{label ?? t('errorPages.loading')}</span>
      <span className="ke-route-loading__bones" aria-hidden="true">
        <span className="ke-route-loading__bone" />
        <span className="ke-route-loading__bone" />
        <span className="ke-route-loading__bone" />
      </span>
    </output>
  )
}
