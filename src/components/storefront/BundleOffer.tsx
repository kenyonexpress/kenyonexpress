import BundleAddButton from '@/components/storefront/BundleAddButton'
import type { BundleOffer as Offer } from '@/lib/bundles/offers'
import { loadBundleOffersForProduct } from '@/lib/bundles/offers'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import Link from 'next/link'

/**
 * "Buy together and save" on the product page (STEP 60). One card per open
 * bundle this product belongs to: the members with their prices, the set's
 * worth, the saving, and what the set costs after it, plus one button that
 * adds every member. Renders nothing when the product is in no bundle, which
 * is the ordinary state.
 *
 * The numbers are the catalogue's current prices and the bundle's fixed
 * amount; the cart recomputes both the moment the set is in it, so what is
 * printed here is a promise the cart keeps or, when a member has gone out
 * of stock since, explains on the line.
 */
export default async function BundleOffer({ productId }: { productId: string }) {
  const offers = await loadBundleOffersForProduct(productId)
  if (offers.length === 0) return null
  return (
    <section className="pdp-bundle" aria-label="קנו יחד וחסכו" data-testid="bundle-offer">
      <h2 className="pdp-details__title">קנו יחד וחסכו</h2>
      <ul className="pdp-bundle__list">
        {offers.map((offer) => (
          <li key={offer.id} className="pdp-bundle__card">
            <OfferCard offer={offer} currentProductId={productId} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function OfferCard({ offer, currentProductId }: { offer: Offer; currentProductId: string }) {
  const worth = agorot(offer.worth_agorot)
  const saving = agorot(Math.min(offer.discount_agorot, offer.worth_agorot))
  const after = agorot(worth - saving)
  return (
    <>
      <h3 className="pdp-bundle__name">{offer.name_he}</h3>
      {offer.description_he && <p className="pdp-bundle__desc">{offer.description_he}</p>}
      <ul className="pdp-bundle__members">
        {offer.members.map((member) => (
          <li key={member.product_id} className="pdp-bundle__member">
            {member.product_id === currentProductId ? (
              <span className="pdp-bundle__member-name">
                {member.name_he}
                {member.quantity > 1 ? ` ×${member.quantity}` : ''} (המוצר הזה)
              </span>
            ) : (
              <Link
                href={`/product/${encodeURIComponent(member.slug)}`}
                className="pdp-bundle__member-name"
              >
                {member.name_he}
                {member.quantity > 1 ? ` ×${member.quantity}` : ''}
              </Link>
            )}
            <span className="pdp-bundle__member-price tabular-nums">
              {shekels(agorot(Math.round(member.price_ils * 100) * member.quantity))}
            </span>
          </li>
        ))}
      </ul>
      <p className="pdp-bundle__math">
        <span>
          בנפרד: <del className="tabular-nums">{shekels(worth)}</del>
        </span>
        <span className="pdp-bundle__saving">
          חיסכון: <strong className="tabular-nums">{shekels(saving)}</strong>
        </span>
        <span>
          יחד: <strong className="tabular-nums">{shekels(after)}</strong>
        </span>
      </p>
      <BundleAddButton
        bundleName={offer.name_he}
        members={offer.members.map((m) => ({
          product_id: m.product_id,
          quantity: m.quantity,
          name_he: m.name_he,
        }))}
      />
    </>
  )
}
