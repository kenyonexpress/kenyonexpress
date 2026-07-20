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
          {i > 0 && <span aria-hidden="true"> </span>}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function defaultHomeCrumb(): Crumb {
  return { label: CATEGORY_TOKENS.breadcrumb.homeLabel, href: '/' }
}
