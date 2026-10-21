import CategoryBreadcrumb from '@/components/category/CategoryBreadcrumb'
import { CITIES } from '@/data/cities'
import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import Link from 'next/link'
import '@/styles/category-page.css'

export const metadata: Metadata = {
  title: 'דילים לפי עיר',
  description: 'כל הערים שבהן יש דילים בקניון EXPRESS.',
  alternates: alternatesFor('/c'),
}

export default function CitiesIndexPage() {
  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[{ label: 'בית', href: '/' }, { label: 'ערים' }]} />
        <header className="category-page__header">
          <h1 className="category-page__title">דילים לפי עיר</h1>
        </header>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
          {CITIES.map((city) => (
            <li key={city.slug}>
              <Link
                href={`/c/${city.slug}`}
                className="flex min-h-11 items-center justify-center rounded border border-border-alt px-3 py-2 text-center"
              >
                {city.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
