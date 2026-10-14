/**
 * The account column while its page is still on its way (UX27).
 *
 * MEASURED BEFORE, on a built server as the seeded customer
 * (logs/ux27/before.json): a direct load of /account/orders flushed its first
 * 15.6KB at 313ms with the content column EMPTY (the layout's fallback was
 * null) and the orders arrived at 2326ms; a press on the ההזמנות שלי tab kept
 * the overview in place for 2289 / 2530 / 2609ms at 380 / 768 / 1440 with
 * nothing to say the press had landed, then swapped. Two seconds of a blank or
 * stale column, on every account page, every time.
 *
 * This is one body for both moments: the `(account)/layout.tsx` Suspense
 * fallback (the server's first flush) and `account/loading.tsx` (the instant
 * state Next paints on a client-side navigation into any /account page). It is
 * the column's own shape at the column's own sizes, drawn from account.css:
 * the title line box, the subtitle, then cards in the `.account-card` frame
 * with a title bar, two lines and a 36px control, so the real page replaces a
 * page-shaped thing and not a hole. The page's own heading is not guessed at:
 * a skeleton that said ההזמנות שלי under /account/wallet would be a lie for
 * two seconds.
 *
 * `aria-busy` on the region and one visually hidden sentence are the whole
 * accessible surface. The bars are `aria-hidden`; a screen reader is told the
 * column is loading once and nothing else.
 */
export const ACCOUNT_SKELETON_CARDS = 3
export const ACCOUNT_LOADING_LABEL = 'טוען את האזור האישי…'

export default function AccountContentSkeleton({
  cards = ACCOUNT_SKELETON_CARDS,
}: {
  cards?: number
}) {
  return (
    <div className="account-pending" data-account-skeleton="" aria-busy="true">
      <p className="sr-only">{ACCOUNT_LOADING_LABEL}</p>
      <div className="account-title account-pending__title" aria-hidden="true">
        <span className="ke-skeleton account-pending__bar account-pending__bar--title" />
      </div>
      <p className="account-subtitle account-pending__subtitle" aria-hidden="true">
        <span className="ke-skeleton account-pending__bar account-pending__bar--subtitle" />
      </p>
      {Array.from({ length: cards }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <section key={i} className="account-card account-pending__card" aria-hidden="true">
          <span className="ke-skeleton account-pending__bar account-pending__bar--card-title" />
          <span className="ke-skeleton account-pending__bar account-pending__bar--line" />
          <span className="ke-skeleton account-pending__bar account-pending__bar--line is-short" />
          <span className="ke-skeleton account-pending__bar account-pending__bar--control" />
        </section>
      ))}
    </div>
  )
}
