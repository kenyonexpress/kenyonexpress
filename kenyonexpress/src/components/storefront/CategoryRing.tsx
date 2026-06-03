import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type Category = {
  id: string
  slug: string
  name_he: string
  icon_url: string | null
}

export default async function CategoryRing() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name_he, icon_url')
    .eq('is_active', true)
    .order('sort_order')
    .limit(10)

  const categories: Category[] = data ?? []

  if (categories.length === 0) return null

  return (
    <div className="overflow-x-auto py-3 scrollbar-none">
      <div className="flex items-center gap-4 min-w-max">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/category/${cat.slug}`}
            className="group flex flex-col items-center gap-1.5 shrink-0"
          >
            <div className="w-[60px] h-[60px] rounded-full border-2 border-gray-200 bg-white overflow-hidden flex items-center justify-center group-hover:border-brand-primary transition-colors">
              {cat.icon_url ? (
                <img
                  src={cat.icon_url}
                  alt=""
                  aria-hidden="true"
                  className="w-8 h-8 object-contain"
                />
              ) : (
                <span className="text-2xl" aria-hidden="true">🏷</span>
              )}
            </div>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-brand-dark text-center leading-tight max-w-[64px] line-clamp-2">
              {cat.name_he}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
