import ProductCard from '@/components/ProductCard'
import NewsletterSignup from '@/components/growth/NewsletterSignup'
import { HOME_CATEGORIES } from '@/lib/home-categories'
import { getDealOfTheDay, getHomeBrands, getHotCoupons } from '@/lib/home-data'
import { repairPriceOrder } from '@/lib/money-format'
import Link from 'next/link'
import BrandsRow from './BrandsRow'
import HotCouponCard from './HotCouponCard'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="home-section__title">{children}</h2>
}

/** 2. Deal of the day: the deepest discount, one card. */
export async function DealOfTheDaySection() {
  const product = await getDealOfTheDay()
  if (!product) return null
  return (
    <section dir="rtl" aria-label="דיל היום" className="home-section home-deal-of-day">
      <SectionTitle>דיל היום</SectionTitle>
      <div className="home-deal-of-day__card">
        <ProductCard product={product} />
      </div>
    </section>
  )
}

/** 3. Categories row: the live menu from KE_LIVE_SPEC.md, nationwide (C137). */
export function CategoriesRowSection() {
  const categories = HOME_CATEGORIES
  return (
    <section dir="rtl" aria-label="קטגוריות" className="home-section">
      <ul className="home-categories">
        {categories.map((c) => (
          <li key={c.slug} className="home-categories__item">
            <Link href={`/category/${c.slug}`} className="home-categories__link">
              {repairPriceOrder(c.name_he)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 5. Hot coupons. */
export async function HotCouponsSection() {
  const coupons = await getHotCoupons()
  if (coupons.length === 0) return null
  return (
    <section dir="rtl" aria-label="קופונים חמים" className="home-section">
      <SectionTitle>קופונים חמים</SectionTitle>
      <div className="home-hot-coupons">
        {coupons.map((coupon) => (
          <HotCouponCard key={coupon.id} coupon={coupon} />
        ))}
      </div>
    </section>
  )
}

/** 6. Brands. */
export async function BrandsSection() {
  const brands = await getHomeBrands()
  if (brands.length === 0) return null
  return (
    <section dir="rtl" aria-label="מותגים" className="home-section">
      <SectionTitle>מותגים</SectionTitle>
      <BrandsRow brands={brands} />
    </section>
  )
}

/** 7. Newsletter band. The footer's own bar is hidden on the home page. */
export function NewsletterSection() {
  return (
    <section dir="rtl" aria-label="הרשמה לניוזלטר" className="home-newsletter">
      <div className="home-newsletter__inner">
        <NewsletterSignup source="home" />
      </div>
    </section>
  )
}
