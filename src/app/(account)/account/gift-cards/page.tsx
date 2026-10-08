import { formatDate, formatIls } from '@/lib/account/format'
import type { GiftCardState } from '@/lib/commerce/gift-card'
import { GIFT_CARD_VALIDITY_YEARS } from '@/lib/commerce/gift-card'
import { sumAgorot } from '@/lib/money'
import { getMyGiftCards } from '@/server/queries/gift-cards'
import Link from 'next/link'

export const metadata = { title: 'הגיפט קארד שלי' }

/**
 * The customer's gift cards (STEP 48): bought and received, with the balance
 * each one still carries.
 *
 * A card is binary (234): its balance is the face value until it is loaded
 * into the wallet, then zero, and from that moment the money is tracked by
 * the wallet ledger, which is why a redeemed row links there. The code itself
 * is never shown: it exists only in the issue email, and this page knows the
 * last four characters and nothing more.
 */

type Chip = 'ok' | 'warn' | 'dead' | 'default'

const STATE_VIEW: Record<GiftCardState, { label: string; chip: Chip }> = {
  active: { label: 'פעיל', chip: 'ok' },
  redeemed: { label: 'נטען לארנק', chip: 'default' },
  expired: { label: 'פג תוקף', chip: 'dead' },
  cancelled: { label: 'בוטל', chip: 'dead' },
}

export default async function GiftCardsPage() {
  const cards = await getMyGiftCards()

  if (!cards) {
    return (
      <>
        <h1 className="account-title">הגיפט קארד שלי</h1>
        <p className="account-empty">יש להתחבר כדי לראות את הגיפט קארד שלך.</p>
      </>
    )
  }

  const activeAgorot = sumAgorot(cards.map((card) => card.balanceAgorot))
  const activeCount = cards.filter((card) => card.state === 'active').length

  return (
    <>
      <h1 className="account-title">הגיפט קארד שלי</h1>
      <p className="account-subtitle">
        גיפט קארד שרכשת או שקיבלת. הקוד נשלח במייל, ובמימוש הסכום נטען לארנק ומשמש בכל רכישה.
      </p>

      <div className="wallet-balance" data-testid="gift-cards-summary">
        <p className="wallet-balance__label">יתרה בגיפט קארד שטרם נטענו</p>
        <p className="wallet-balance__amount">{formatIls(activeAgorot)}</p>
        <p className="wallet-balance__note">
          {activeCount === 0
            ? 'אין כרגע גיפט קארד פעיל שממתין למימוש.'
            : `${activeCount} פעילים. תוקף כל כרטיס ${GIFT_CARD_VALIDITY_YEARS} שנים מההנפקה.`}
        </p>
        <p style={{ marginTop: 12 }}>
          <Link className="account-btn" href="/gift-card">
            מימוש קוד
          </Link>{' '}
          <Link className="account-btn" href="/account/wallet">
            לתנועות הארנק
          </Link>
        </p>
      </div>

      <section className="account-card">
        {cards.length === 0 ? (
          <p className="account-empty">
            עדיין אין לך גיפט קארד. קיבלת קוד במייל?{' '}
            <Link href="/gift-card" className="coupon-card__link">
              אפשר לממש אותו כאן
            </Link>
            .
          </p>
        ) : (
          cards.map((card) => {
            const view = STATE_VIEW[card.state]
            return (
              <div className="account-row" key={card.id} data-state={card.state}>
                <div className="account-row__main">
                  <p className="coupon-card__code" dir="ltr">
                    ****-****-****-{card.codeLast4}
                  </p>
                  <p className="account-row__title">
                    גיפט קארד על סך {formatIls(card.amountAgorot)}
                    {card.role === 'received' ? ' (התקבל במתנה)' : ''}
                  </p>
                  <p className="account-row__meta">
                    <span className={`account-chip account-chip--${view.chip}`}>{view.label}</span>
                    {card.state === 'redeemed' && card.redeemedAt
                      ? ` · נטען לארנק ב-${formatDate(card.redeemedAt)}`
                      : ` · בתוקף עד ${formatDate(card.expiresAt)}`}
                    {` · הונפק ${formatDate(card.issuedAt)}`}
                  </p>
                  <p className="account-row__meta">
                    יתרה בכרטיס: {formatIls(card.balanceAgorot)}
                    {card.role === 'bought' && card.recipientName
                      ? ` · נשלח ל${card.recipientName}`
                      : ''}
                  </p>
                </div>
                <div className="account-row__actions">
                  {card.state === 'active' && (
                    <Link className="account-btn" href="/gift-card">
                      מימוש לארנק
                    </Link>
                  )}
                  {card.state === 'redeemed' && (
                    <Link className="account-btn" href="/account/wallet">
                      לתנועות הארנק
                    </Link>
                  )}
                  {card.orderId && card.role === 'bought' && (
                    <Link className="account-btn" href={`/account/orders/${card.orderId}`}>
                      להזמנה
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>
    </>
  )
}
