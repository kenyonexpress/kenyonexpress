/**
 * The cart page before the cart is known (UX27).
 *
 * `/cart` is a static page; the cart arrives from `/api/cart` after
 * hydration. Until the store is settled (see `CartPageView`), the page used
 * to render the empty state, so a shopper with lines in the cart read the
 * yellow "your cart is empty" banner for 1.5-2.0s on every visit (measured
 * at 380 / 768 / 1440, logs/ux27/before.json). This is the page's own grid
 * instead: the items frame with `lines` rows in the `.cart-line` grid (the
 * 100px thumbnail box, a name, a meta line, a quantity control), and the
 * totals column with its title, three rows and the checkout button's box, all
 * on the real classes so the geometry follows cart-page.css at every width.
 *
 * `lines` is the device's mirror count, capped at three: enough rows to be a
 * list, never a page of grey for a cart of twenty.
 */
export const CART_LOADING_LABEL = 'טוען את סל הקניות…'

export default function CartPageSkeleton({ lines = 1 }: { lines?: number }) {
  const count = Math.max(1, Math.min(lines, 3))
  return (
    <div className="cart-page__grid" data-cart-skeleton="" aria-busy="true">
      <p className="sr-only">{CART_LOADING_LABEL}</p>
      <section aria-hidden="true">
        <div className="cart-page__items">
          {Array.from({ length: count }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
            <div key={i} className="cart-line cart-line--pending">
              <span className="cart-line__thumb ke-skeleton cart-pending__thumb" />
              <div className="cart-line__body">
                <span className="ke-skeleton cart-pending__name" />
                <span className="ke-skeleton cart-pending__meta" />
                <div className="cart-line__footer">
                  <span className="ke-skeleton cart-pending__qty" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div aria-hidden="true">
        <aside className="cart-sidebar">
          <div className="cart-sidebar__title">
            <span className="ke-skeleton cart-pending__title" />
          </div>
          <div className="cart-sidebar__rows">
            <span className="ke-skeleton cart-pending__row" />
            <span className="ke-skeleton cart-pending__row" />
            <span className="ke-skeleton cart-pending__row is-total" />
          </div>
          <span className="ke-skeleton cart-pending__button" />
        </aside>
      </div>
    </div>
  )
}
