import { createClient } from '@/lib/supabase/server'
import { AlignJustify, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const LEGACY_CATEGORIES = [
  { label: 'דילים חמים 🔥', href: '#' },
  { label: 'עד ₪99', href: '#' },
  { label: 'החדשים', href: '#' },
  { label: 'מסעדות ובתי קפה', href: '#' },
  { label: 'יופי בריאות וטיפוח', href: '#' },
  { label: 'טלפונים מחשבים ואביזרים', href: '/category/electronics' },
  { label: 'תינוקות וילדים', href: '#' },
  { label: 'צימרים ובתי מלון', href: '#' },
]

type Category = { id: string; slug: string; name_he: string; icon_url: string | null }

export default async function CategorySidebar() {
  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, slug, name_he, icon_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(12)

  const items: Category[] = categories ?? []

  return (
    <aside className="w-[240px] shrink-0 bg-white overflow-hidden border-e border-gray-200">
      {/* Header */}
      <div className="bg-brand-primary text-brand-dark px-4 py-3 flex items-center gap-2">
        <AlignJustify size={18} strokeWidth={2.5} aria-hidden="true" />
        <span className="font-black text-sm tracking-wide">מחלקות</span>
      </div>

      {/* Supabase categories */}
      {items.length > 0 && (
        <ul>
          {items.map((cat) => (
            <li key={cat.id} className="border-b border-gray-100 last:border-b-0">
              <Link
                href={`/category/${cat.slug}`}
                className="flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-brand-accent hover:text-brand-dark transition-colors group"
              >
                <span className="flex items-center gap-2">
                  {cat.icon_url ? (
                    <img
                      src={cat.icon_url}
                      alt=""
                      aria-hidden="true"
                      className="w-5 h-5 object-contain"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-[10px]">
                      🏷
                    </span>
                  )}
                  {cat.name_he}
                </span>
                <ChevronLeft
                  size={14}
                  className="text-gray-400 group-hover:text-brand-dark rtl:rotate-180 transition-transform"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Divider */}
      <div className="h-px bg-brand-primary mx-0 my-0" aria-hidden="true" />

      {/* Legacy / hardcoded categories */}
      <ul>
        {LEGACY_CATEGORIES.map((cat) => (
          <li key={cat.label} className="border-b border-gray-100 last:border-b-0">
            <Link
              href={cat.href}
              className="flex items-center justify-between px-4 py-2 text-sm text-gray-600 hover:bg-brand-accent hover:text-brand-dark transition-colors group"
            >
              <span>{cat.label}</span>
              <ChevronLeft
                size={14}
                className="text-gray-300 group-hover:text-brand-dark rtl:rotate-180"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
