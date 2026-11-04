'use client'

import CartCheckoutButton from '@/components/cart/CartCheckoutButton'
import CartCouponForm from '@/components/cart/CartCouponForm'
import CartLineItem, { CartEmptyState } from '@/components/cart/CartLineItem'
import { useCart, useCartAuth } from '@/components/cart/CartProvider'
import CartTotalsSidebar from '@/components/cart/CartTotalsSidebar'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * Takes no props, which is what makes /cart a prerendered page.
 *
 * It used to receive `initialCart` and `isAuthenticated` from a server
 * component that awaited `getCart()` and `auth.getUser()`, and then wrote the
 * cart into the store from an effect - the same store the layout's
 * `<CartBootstrap>` now fills, from the same two reads. Two servers reads for
 * one cart, and the page could not be static because of the second one.
 *
 * Reading both straight off the store deletes the duplicate and leaves this
 * whole route in the static shell.
 */
export default function CartPageView() {
  const { cart, clear, removeUnavailable, isPending, serverConfirmed, mirrorCount } = useCart()
  const isAuthenticated = useCartAuth()

  const unavailableCount = cart.items.filter((item) => !item.available).length
  const hasUnavailable = unavailableCount > 0
  const isEmpty = cart.items.length === 0
  // The page is prerendered with an empty store and the cart arrives from
  // /api/cart a second or two later. Measured on a local build: a guest with
  // one item read "סל הקניות שלך ריק כרגע." for that whole wait, under a header
  // badge already saying 1. While the persisted count says there is something
  // and the server has not answered, the honest state is loading, not empty.
  const awaitingServer = isEmpty && !serverConfirmed && mirrorCount > 0

  return (
    <div className="cart-page">
      {/* The h1 was hidden here on a claim that live has no visible heading.
          refs/ke_live_computed.json disagrees at all three widths: live draws
          h1.entry-title at 39.998px/500, 48px tall, above the cart table. D25
          made it visible again; the styling notes live's geometry in
          cart-page.css. */}
      <nav className="cart-page__breadcrumb" aria-label="פירורי לחם">
        <Link href="/" className="cart-page__crumb">
          עמוד הבית
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">סל הקניות</span>
      </nav>
      <h1 className="cart-page__title">סל הקניות</h1>

      {awaitingServer ? (
        <div className="cart-page__loading" aria-busy="true">
          <output>{t('cartPage.loading')}</output>
        </div>
      ) : isEmpty ? (
        <CartEmptyState />
      ) : (
        <div className="cart-page__grid">
          <section aria-label="פריטים בעגלה">
            {/* The checkout button below is disabled while any line is
                unavailable, and until now the only way past it was to find each
                offending line and remove it by hand, one round trip each. With
                a cart of a dozen items and three dead lines that is a puzzle,
                not a checkout. The count comes from the rendered view; the
                server re-decides which lines those are when the button is
                pressed, because this view is as old as the last render. */}
            {hasUnavailable && (
              <div className="cart-page__blocked" role="alert">
                <p className="cart-page__blocked-text">
                  {unavailableCount === 1
                    ? 'פריט אחד בעגלה אינו זמין ואי אפשר להמשיך לתשלום איתו.'
                    : `${unavailableCount} פריטים בעגלה אינם זמינים ואי אפשר להמשיך לתשלום איתם.`}
                </p>
                <button
                  type="button"
                  className="cart-page__blocked-action"
                  onClick={() => void removeUnavailable()}
                  disabled={isPending}
                >
                  {unavailableCount === 1 ? 'הסר את הפריט' : 'הסר את הפריטים'}
                </button>
              </div>
            )}

            {/* Electro's `table.shop_table.cart`. Below 768 the CSS turns
                each row into a stacked card labelled from `data-title`. The
                header cells for remove and thumbnail are empty in Electro;
                they carry screen-reader names here so the columns are named. */}
            <table className="cart-table">
              <thead>
                <tr>
                  <th scope="col" className="cart-table__th--remove">
                    <span className="sr-only">{t('cartPage.colRemove')}</span>
                  </th>
                  <th scope="col" className="cart-table__th--thumb">
                    <span className="sr-only">{t('cartPage.colImage')}</span>
                  </th>
                  <th scope="col">{t('cartPage.colProduct')}</th>
                  <th scope="col">{t('cartPage.colPrice')}</th>
                  <th scope="col">{t('cartPage.colQuantity')}</th>
                  <th scope="col">{t('cartPage.colSubtotal')}</th>
                </tr>
              </thead>
              <tbody>
                {cart.items.map((item) => (
                  <CartLineItem
                    key={`${item.product_id}::${item.variant_id ?? 'null'}`}
                    item={item}
                  />
                ))}
                {/* Electro's actions row: coupon on the start side, the gray
                    pill on the end. Electro's pill is "Update cart"; quantities
                    here save on every press, so the pill empties the cart. */}
                <tr className="cart-table__actions">
                  <td colSpan={6}>
                    <div className="cart-table__actions-inner">
                      <CartCouponForm coupon={cart.coupon} />
                      <button
                        type="button"
                        className="cart-page__clear"
                        onClick={() => void clear()}
                        disabled={isPending}
                      >
                        רוקן עגלה
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <div className="cart-collaterals">
            <CartTotalsSidebar
              cart={cart}
              checkout={
                <CartCheckoutButton
                  isAuthenticated={isAuthenticated}
                  disabled={hasUnavailable || isEmpty}
                />
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
