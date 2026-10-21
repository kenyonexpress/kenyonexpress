import CopyrightYear from '@/components/CopyrightYear'
import FooterAccordion from '@/components/FooterAccordion'
import { FaFacebook, FaInstagram } from '@/components/icons/electro-icons'
import { businessRegistrationLine } from '@/lib/legal-entity'

type FooterLink = { label: string; href: string }

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'אודות',
    links: [
      { label: 'מי אנחנו', href: '/about' },
      { label: 'קריירה', href: '#' },
      { label: 'שותפים עסקיים', href: '#' },
      { label: 'צור קשר', href: '/contact' },
    ],
  },
  {
    title: 'שירות לקוחות',
    links: [
      { label: 'שאלות נפוצות', href: '#' },
      { label: 'מעקב הזמנה', href: '#' },
      { label: 'מדיניות החזרות', href: '/refund_returns' },
      { label: 'מימוש קופונים', href: '#' },
    ],
  },
  {
    title: 'משפטי',
    links: [
      { label: 'תנאי שימוש', href: '/terms' },
      { label: 'מדיניות פרטיות', href: '/privacy' },
      { label: 'מדיניות עוגיות', href: '#' },
      { label: 'נגישות', href: '#' },
    ],
  },
]

const socials: { label: string; href: string }[] = [
  {
    label: 'פייסבוק',
    href: 'https://www.facebook.com/קניון-Express-114398873446854/',
  },
  {
    label: 'אינסטגרם',
    href: 'https://www.instagram.com/kenyonexpress',
  },
]

function FooterSection({
  title,
  links,
}: {
  title: string
  links: FooterLink[]
}) {
  return (
    <div>
      <h2 className="text-white text-footer-heading mb-3">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function SiteFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-8">
      {/* Desktop Footer - 4 columns */}
      <div className="hidden md:block">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-4 gap-8 mb-10">
            {columns.map((col) => (
              <FooterSection key={col.title} title={col.title} links={col.links} />
            ))}

            {/* Social Column */}
            <div>
              <h2 className="text-white text-footer-heading mb-4">עקבו אחרינו</h2>
              <div className="flex items-center gap-3 mb-6">
                {socials.map(({ label, href }) => {
                  const Icon = label === 'פייסבוק' ? FaFacebook : FaInstagram
                  return (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="w-10 h-10 rounded-full bg-gray-800 hover:bg-brand flex items-center justify-center transition-colors"
                    >
                      <Icon size={20} />
                    </a>
                  )
                })}
              </div>

              {/* Payment Methods */}
              <div className="mt-8">
                <h2 className="text-white font-bold mb-3 text-sm">אמצעי תשלום</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">💳 כרטיס אשראי</span>
                  <span className="text-xs text-gray-400">🏦 העברה בנקאית</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Logos - Desktop */}
          <div className="border-t border-gray-800 py-6 flex items-center justify-between">
            <div className="text-xs text-gray-400">
              © <CopyrightYear /> קניון EXPRESS. {businessRegistrationLine()}. כל הזכויות שמורות.
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">אמצעי תשלום:</span>
              <div className="flex gap-2">
                <div className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300">💳</div>
                <div className="bg-gray-800 px-2 py-1 rounded text-xs text-gray-300">🏦</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Footer - Accordion */}
      <div className="md:hidden">
        <div className="bg-gray-800">
          <FooterAccordion columns={columns} socials={socials} />
        </div>

        {/* Mobile Copyright */}
        <div className="px-4 py-4 text-center text-xs text-gray-400 border-t border-gray-800">
          © <CopyrightYear /> קניון EXPRESS. {businessRegistrationLine()}. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  )
}
