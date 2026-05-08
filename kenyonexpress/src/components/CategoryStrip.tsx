import Link from 'next/link'

const categories = [
  { emoji: '📱', label: 'טלפונים' },
  { emoji: '💻', label: 'מחשבים' },
  { emoji: '👗', label: 'אופנה' },
  { emoji: '🍔', label: 'מסעדות' },
  { emoji: '🏠', label: 'בית וגן' },
  { emoji: '💊', label: 'בריאות' },
  { emoji: '🎮', label: 'גיימינג' },
  { emoji: '🧸', label: 'ילדים' },
  { emoji: '✈️', label: 'נסיעות' },
  { emoji: '💅', label: 'יופי' },
  { emoji: '🐾', label: 'חיות מחמד' },
  { emoji: '⚽', label: 'ספורט' },
]

export default function CategoryStrip() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => (
          <Link
            key={cat.label}
            href="/products"
            className="flex flex-col items-center gap-1.5 p-3 min-w-[72px] rounded-xl hover:bg-gray-50 hover:border-accent border border-transparent transition-all shrink-0"
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span className="text-[11px] font-medium text-gray-700 whitespace-nowrap">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
