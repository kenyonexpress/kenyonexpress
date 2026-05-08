const columns = [
  {
    title: 'קניון Express',
    links: ['מי אנחנו', 'קריירה', 'שותפים', 'צור קשר'],
  },
  {
    title: 'שירות לקוחות',
    links: ['שאלות נפוצות', 'מדיניות החזרות', 'תנאי שימוש', 'פרטיות'],
  },
  {
    title: 'קטגוריות',
    links: ['דילים חמים', 'מוצרים חדשים', 'קופונים', 'מסעדות'],
  },
  {
    title: 'עקבו אחרינו',
    links: ['פייסבוק', 'אינסטגרם', 'טיקטוק', 'ניוזלטר'],
  },
]

export default function SiteFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-8">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-4 gap-8">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-white font-bold mb-3 text-sm">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm hover:text-white transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800 mt-8 pt-4 text-center text-xs text-gray-500">
          © 2025 קניון Express. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  )
}
