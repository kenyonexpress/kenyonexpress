import {
  type CouponTab,
  couponStatusLabel,
  couponStatusTone,
  formatDate,
  formatIls,
  formatVoucherCode,
  voucherTab,
} from '@/lib/account/format'
import {
  type CustomerVoucher,
  getCustomerVouchers,
  isVoucherRedeemable,
} from '@/server/queries/vouchers'
import Link from 'next/link'
import QRCode from 'qrcode'

export const metadata = { title: 'הקופונים שלי' }

const TABS: { id: CouponTab; label: string }[] = [
  { id: 'active', label: 'פעיל' },
  { id: 'redeemed', label: 'נסרק' },
  { id: 'expired', label: 'פג תוקף' },
]

function parseTab(raw: string | undefined): CouponTab {
  if (raw === 'redeemed' || raw === 'expired' || raw === 'active') return raw
  return 'active'
}

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabRaw } = await searchParams
  const tab = parseTab(tabRaw)
  const vouchers = await getCustomerVouchers()

  const grouped: Record<CouponTab, CustomerVoucher[]> = {
    active: [],
    redeemed: [],
    expired: [],
  }
  for (const v of vouchers) {
    grouped[voucherTab(v)].push(v)
  }

  const visible = grouped[tab]

  const qrByVoucher = new Map<string, string>()
  await Promise.all(
    visible
      .filter((v) => isVoucherRedeemable(v))
      .map(async (v) => {
        try {
          qrByVoucher.set(v.id, await QRCode.toDataURL(v.qr_payload, { margin: 1, width: 240 }))
        } catch {
          // A QR failure must not blank the whole page; the code stays usable.
        }
      }),
  )

  return (
    <>
      <h1 className="account-title">הקופונים שלי</h1>
      <p className="account-subtitle">הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה.</p>

      <nav className="account-tabs" aria-label="סינון קופונים">
        {TABS.map((t) => {
          const count = grouped[t.id].length
          const href = t.id === 'active' ? '/account/coupons' : `/account/coupons?tab=${t.id}`
          return (
            <Link
              key={t.id}
              href={href}
              className={`account-tabs__link${tab === t.id ? ' is-active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
              <span className="account-tabs__count">{count}</span>
            </Link>
          )
        })}
      </nav>

      <section className="account-card">
        {visible.length === 0 ? (
          <p className="account-empty">
            {tab === 'active'
              ? 'אין קופונים פעילים כרגע.'
              : tab === 'redeemed'
                ? 'עדיין לא נסרקו קופונים.'
                : 'אין קופונים שפג תוקפם.'}
          </p>
        ) : (
          <ul className="coupon-list">
            {visible.map((v) => {
              const redeemable = isVoucherRedeemable(v)
              const qr = qrByVoucher.get(v.id)
              return (
                <li className="coupon-card coupon-card--stack" key={v.id}>
                  <div className="coupon-card__head">
                    <div>
                      <p className="account-row__title">{v.product?.name_he ?? 'קופון'}</p>
                      {v.supplier?.name ? (
                        <p className="account-row__meta">{v.supplier.name}</p>
                      ) : null}
                    </div>
                    <span className={`account-chip account-chip--${couponStatusTone(v.status)}`}>
                      {couponStatusLabel(v.status)}
                    </span>
                  </div>

                  {redeemable && qr ? (
                    <div className="coupon-card__qr">
                      {/* eslint-disable-next-line @next/next/no-img-element -- server QR data URI */}
                      <img
                        src={qr}
                        alt={`קוד QR לקופון ${formatVoucherCode(v.code)}`}
                        width={200}
                        height={200}
                      />
                      <p className="coupon-card__code">{formatVoucherCode(v.code)}</p>
                      <p className="account-row__meta">הצגת הקוד בבית העסק</p>
                    </div>
                  ) : (
                    <div className="coupon-card__stamp">
                      <p className="coupon-card__code">{formatVoucherCode(v.code)}</p>
                      <p className="account-row__meta">
                        {v.status === 'redeemed' && v.redeemed_at
                          ? `מומש ב-${formatDate(v.redeemed_at)}`
                          : couponStatusLabel(v.status)}
                      </p>
                    </div>
                  )}

                  <dl className="coupon-card__amounts">
                    <div>
                      <dt>שולם באתר</dt>
                      <dd>{formatIls(v.coupon_price_agorot)}</dd>
                    </div>
                    <div>
                      <dt>יתרה בבית העסק</dt>
                      <dd>{formatIls(v.remaining_amount_due_agorot)}</dd>
                    </div>
                    <div>
                      <dt>בתוקף עד</dt>
                      <dd>{formatDate(v.expires_at)}</dd>
                    </div>
                  </dl>

                  <p className="coupon-card__link">
                    <Link className="account-btn" href={`/coupon/${v.id}`}>
                      דף קופון מלא
                    </Link>
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
