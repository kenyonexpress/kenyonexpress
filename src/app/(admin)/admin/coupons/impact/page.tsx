import { formatIls } from '@/lib/account/format'
import { couponImpact } from '@/lib/admin/coupon-impact'
import { requireSection } from '@/lib/admin/rbac'
import { agorot } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

export const metadata = { title: 'השפעת קופונים' }

/**
 * Usage and on-site revenue per coupon product, folded through couponImpact
 * so a refunded voucher cannot inflate the total.
 */
export default async function CouponImpactPage() {
  await requireSection('catalog', 'read')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vouchers')
    .select('status, coupon_price_agorot, product:products(id, name_he)')
    .limit(2000)
  // A failed read must not render as "no coupon usage": that is a false zero on a revenue page.
  if (error) throw new Error(`coupon impact read failed: ${error.message}`)

  type Row = {
    status: string
    coupon_price_agorot: number | null
    product:
      | { id: string; name_he: string | null }
      | { id: string; name_he: string | null }[]
      | null
  }

  const rows = ((data ?? []) as unknown as Row[]).flatMap((row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product
    if (!product) return []
    return [
      {
        productId: product.id,
        productName: product.name_he ?? 'מוצר',
        status: row.status,
        couponPriceAgorot: row.coupon_price_agorot ?? 0,
      },
    ]
  })

  const impact = couponImpact(rows)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">השפעת קופונים</h1>
        <Link href="/admin/coupons" className="text-sm text-brand hover:underline">
          חזרה לקופונים
        </Link>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 p-4">
          <dt className="text-xs text-black/50">הונפקו</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{impact.issued}</dd>
        </div>
        <div className="rounded-lg border border-black/10 p-4">
          <dt className="text-xs text-black/50">מומשו</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{impact.redeemed}</dd>
        </div>
        <div className="rounded-lg border border-black/10 p-4">
          <dt className="text-xs text-black/50">הכנסה באתר</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">
            {formatIls(agorot(impact.platformRevenueAgorot))}
          </dd>
        </div>
      </dl>

      {impact.products.length === 0 ? (
        <p className="text-sm text-black/50">אין שוברים לסיכום.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-start text-black/50">
              <th className="py-2 font-medium">מוצר</th>
              <th className="py-2 font-medium">הונפקו</th>
              <th className="py-2 font-medium">מומשו</th>
              <th className="py-2 font-medium">הוחזרו</th>
              <th className="py-2 font-medium">הכנסה באתר</th>
            </tr>
          </thead>
          <tbody>
            {impact.products.map((row) => (
              <tr key={row.productId} className="border-b border-black/5">
                <td className="py-2">{row.productName}</td>
                <td className="py-2 tabular-nums">{row.issued}</td>
                <td className="py-2 tabular-nums">{row.redeemed}</td>
                <td className="py-2 tabular-nums">{row.refunded}</td>
                <td className="py-2 tabular-nums">
                  {formatIls(agorot(row.platformRevenueAgorot))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
