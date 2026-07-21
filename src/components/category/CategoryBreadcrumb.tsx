import { CATEGORY_TOKENS } from '@/lib/category-tokens'
import Link from 'next/link'

type Crumb = { label: string; href?: string }

type Props = {
  items: Crumb[]
}

export default function CategoryBreadcrumb({ items }: Props) {
  return (
    <nav className="category-breadcrumb" aria-label="נתיב ניווט">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`}>
          {i > 0 && (
            <span className="category-breadcrumb__sep" aria-hidden="true">
              <svg
                viewBox="0 0 8 12"
                width={7}
                height={10}
                fill="currentColor"
                className="inline-block"
                aria-hidden="true"
              >
                <path d="M5.9 0 0 6l5.9 6L8 9.9 4.2 6 8 2.1z" />
              </svg>
            </span>
          )}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function defaultHomeCrumb(): Crumb {
  return { label: CATEGORY_TOKENS.breadcrumb.homeLabel, href: '/' }
}
