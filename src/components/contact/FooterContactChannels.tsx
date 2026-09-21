import { topicsFor } from '@/lib/contact/channels'
import { t } from '@/lib/i18n/messages'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import { listActiveContactChannels } from '@/server/contact/channels'

/**
 * The footer's topic list: one plain link per active channel. Server-rendered
 * and untracked, for the reason docs/WHATSAPP.md gives for the old float:
 * hydrating the footer of every page to count a tap is the wrong trade. The
 * picker on /contact and the float count theirs.
 */
export default async function FooterContactChannels() {
  const storeNumber = storeWhatsAppNumber()
  if (!storeNumber) return null
  const channels = await listActiveContactChannels()
  const links = topicsFor(channels, storeNumber)
  if (links.length === 0) return null
  return (
    <div className="pb-4 lg:pb-0" data-testid="footer-contact-channels">
      <strong className="mt-3 block text-sm font-bold text-heading">
        {t('contact.footerHeading')}
      </strong>
      <ul className="mt-1.5 space-y-1.5">
        {links.map((link) => (
          <li key={link.key}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              data-channel={link.key}
              className="text-sm text-heading/80 transition-colors hover:text-heading"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
