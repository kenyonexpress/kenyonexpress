'use client'

import SecurityClient from '@/app/(account)/account/security/SecurityClient'
import AddressManager from '@/components/account/AddressManager'
import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import PasskeyManager from '@/components/auth/PasskeyManager'
import TierBadge from '@/components/club/TierBadge'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import type { Agorot } from '@/lib/money'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { signOut } from '@/server/actions/auth'
import type { AccountAddress } from '@/server/queries/account'
import type { MyTier } from '@/server/queries/club'
import type { CustomerVoucher } from '@/server/queries/vouchers'
import type { WishlistEntry } from '@/server/queries/wishlist'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

type TabId = 'overview' | 'orders' | 'wishlist' | 'addresses' | 'settings'

const TABS = [
  { id: 'overview' as const, label: 'סקירה' },
  { id: 'orders' as const, label: 'ההזמנות שלי' },
  { id: 'wishlist' as const, label: 'רשימת המשאלות' },
  { id: 'addresses' as const, label: 'כתובות' },
  { id: 'settings' as const, label: 'הגדרות' },
]

interface Order {
  id: string
  totalAgorot: Agorot
  settlementStatus: string
  createdAt: string
  itemCount: number
  hasVouchers?: boolean
  hasInvoice?: boolean
}

interface AccountProfile {
  fullName: string | null
  email: string
  phone?: string | null
}

interface AccountPageContentProps {
  wallet: { balanceAgorot: Agorot }
  orders: Order[]
  coupons: CustomerVoucher[]
  tier: MyTier | null
  wishlistEntries: WishlistEntry[]
  profile: AccountProfile | null
  addresses: AccountAddress[]
  isStaff: boolean
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string')
  return first ?? null
}

export default function AccountPageContent({
  wallet,
  orders,
  coupons,
  tier,
  wishlistEntries,
  profile,
  addresses,
  isStaff,
}: AccountPageContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const lastOrder = orders[0] ?? null
  // Coupons are already filtered on the server side
  const activeCoupons = coupons

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <>
            <h1 className="account-title">האזור האישי</h1>
            <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

            <div className="wallet-balance">
              <p className="wallet-balance__label">יתרת הארנק</p>
              <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
              <p className="wallet-balance__note">קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.</p>
            </div>

            {tier && (
              <section className="account-card" aria-label="מועדון הלקוחות">
                <h2 className="account-card__title">מועדון הלקוחות</h2>
                <p className="account-row__title">
                  דרגה: <TierBadge tierKey={tier.tierKey} nameHe={tier.tierNameHe} />
                </p>
                <p className="account-row__meta">
                  רכישות ב-12 החודשים האחרונים: {formatIls(tier.spendAgorot)}
                </p>
                {tier.nextTierNameHe && (
                  <>
                    <p className="account-row__meta">
                      עוד {formatIls(tier.toNextAgorot)} לדרגת {tier.nextTierNameHe}
                    </p>
                    <div className="mt-2">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-primary transition-all"
                          style={{
                            width:
                              tier.toNextAgorot > 0
                                ? `${Math.min(100, Math.round((tier.spendAgorot / (tier.spendAgorot + tier.toNextAgorot)) * 100))}%`
                                : '100%',
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
                {!tier.nextTierNameHe && (
                  <p className="account-row__meta">הגעת לדרגה הגבוהה ביותר</p>
                )}
                {tier.cashbackBonusPercent > 0 && (
                  <p className="account-row__meta mt-2">בונוס קשבק: {tier.cashbackBonusPercent}%</p>
                )}
                {tier.benefits.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted">הטבות:</p>
                    <ul className="mt-1 list-disc ps-5">
                      {tier.benefits.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            <div className="account-grid">
              <section className="account-card">
                <h2 className="account-card__title">ההזמנה האחרונה</h2>
                {lastOrder ? (
                  <>
                    <p className="account-row__title">
                      {formatIls(lastOrder.totalAgorot)}{' '}
                      <span
                        className={`account-chip account-chip--${orderStatusTone(lastOrder.settlementStatus)}`}
                      >
                        {orderStatusLabel(lastOrder.settlementStatus)}
                      </span>
                    </p>
                    <p className="account-row__meta">
                      {formatDate(lastOrder.createdAt)} · {lastOrder.itemCount} פריטים
                    </p>
                    <p style={{ marginTop: 12 }}>
                      <Link className="account-btn" href={`/account/orders/${lastOrder.id}`}>
                        לפרטי ההזמנה
                      </Link>
                    </p>
                  </>
                ) : (
                  <p className="account-row__meta">עוד לא ביצעת הזמנות.</p>
                )}
              </section>

              <section className="account-card">
                <h2 className="account-card__title">קופונים פעילים</h2>
                <p className="account-row__title">{activeCoupons.length}</p>
                <p className="account-row__meta">
                  {activeCoupons.length > 0
                    ? 'מוכנים לסריקה בבית העסק'
                    : 'אין כרגע קופונים שממתינים למימוש'}
                </p>
                <p style={{ marginTop: 12 }}>
                  <Link className="account-btn" href="/account/coupons">
                    לכל הקופונים
                  </Link>
                </p>
              </section>

              <section className="account-card">
                <h2 className="account-card__title">סך ההזמנות</h2>
                <p className="account-row__title">{orders.length}</p>
                <p className="account-row__meta">היסטוריית הרכישות שלך</p>
                <p style={{ marginTop: 12 }}>
                  <Link className="account-btn" href="/account/orders">
                    לכל ההזמנות
                  </Link>
                </p>
              </section>
            </div>
          </>
        )

      case 'orders':
        return (
          <>
            <h1 className="account-title">ההזמנות שלי</h1>
            <p className="account-subtitle">{orders.length} הזמנות</p>

            <section className="account-card">
              {orders.length === 0 ? (
                <p className="account-empty">עוד לא ביצעת הזמנות.</p>
              ) : (
                orders.map((order) => (
                  <div className="account-row" key={order.id}>
                    <div className="account-row__main">
                      <p className="account-row__title">
                        {formatIls(order.totalAgorot)}{' '}
                        <span
                          className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}
                        >
                          {orderStatusLabel(order.settlementStatus)}
                        </span>
                      </p>
                      <p className="account-row__meta">
                        {formatDate(order.createdAt)} · {order.itemCount} פריטים
                        {order.hasVouchers ? ' · כולל קופונים' : ''}
                      </p>
                    </div>
                    <div className="account-row__actions">
                      <Link className="account-btn" href={`/account/orders/${order.id}`}>
                        פרטים
                      </Link>
                      {order.hasInvoice && (
                        <a
                          className="account-btn"
                          href={`/account/orders/${order.id}/invoice`}
                          download
                        >
                          חשבונית
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )

      case 'wishlist':
        return (
          <>
            <h1 className="account-title">רשימת המשאלות שלי</h1>
            {wishlistEntries.length === 0 ? (
              <p className="text-muted">
                עוד לא שמרת מוצרים. לחיצה על הלב בעמוד מוצר שומרת אותו כאן.{' '}
                <Link href="/products" className="font-semibold text-price underline">
                  לכל המוצרים
                </Link>
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {wishlistEntries.map((entry) => {
                  const image = firstImage(entry.product?.images)
                  const name = entry.product?.name_he ?? 'מוצר'
                  const href = entry.product?.slug ? `/product/${entry.product.slug}` : null
                  const body = (
                    <span className="flex items-center gap-3">
                      {image ? (
                        <Image
                          src={image}
                          alt=""
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="h-16 w-16 rounded-lg bg-surface-hover"
                        />
                      )}
                      <span>
                        <span className="block font-semibold">{name}</span>
                        {entry.product?.price_ils != null ? (
                          <span className="block text-sm text-price">
                            {shekelsFromIlsRounded(entry.product.price_ils)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  )
                  return (
                    <li key={entry.product_id} className="rounded-lg border border-border-alt p-3">
                      {href ? <Link href={href}>{body}</Link> : body}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )

      case 'addresses':
        return (
          <>
            <h1 className="account-title">כתובות</h1>
            <p className="account-subtitle">כתובות למשלוח מוצרים פיזיים</p>
            <AddressManager addresses={addresses} />
          </>
        )

      case 'settings':
        return (
          <>
            <h1 className="account-title">הגדרות החשבון</h1>
            <p className="account-subtitle">נהל את הגדרות החשבון שלך ואבטחה</p>

            <section className="account-card">
              <h2 className="account-card__title">הפרטים שלי</h2>
              {profile ? (
                <ProfileDetailsForm
                  fullName={profile.fullName}
                  phone={profile.phone ?? null}
                  email={profile.email}
                />
              ) : null}
            </section>

            <section className="account-card">
              <h2 className="account-card__title">אבטחת החשבון</h2>
              <PasskeyManager />
              <SecurityClient isStaff={isStaff} />
            </section>

            <section className="account-card">
              <h2 className="account-card__title">יציאה מהחשבון</h2>
              <form action={signOut}>
                <button type="submit" className="account-btn">
                  התנתקות
                </button>
              </form>
            </section>
          </>
        )

      default:
        return null
    }
  }

  return (
    <>
      <nav className="account-tabs" aria-label="טבים בתחום האזור האישי">
        <div className="account-tabs__header">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`account-tabs__button${activeTab === tab.id ? ' is-active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="account-tabs__content" data-tab={activeTab}>
        {renderTabContent()}
      </div>
    </>
  )
}
