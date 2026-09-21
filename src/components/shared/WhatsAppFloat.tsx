import WhatsAppFloatSheet from '@/components/contact/WhatsAppFloatSheet'
import { topicsFor } from '@/lib/contact/channels'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import { listActiveContactChannels } from '@/server/contact/channels'

/**
 * Floating WhatsApp button on every storefront, main and account page.
 *
 * Server side it resolves the topics (table or defaults) and hands plain
 * hrefs to the client sheet. It is mounted in layouts, which do not know the
 * page, so the list is the operator's order; the page-specific openers from
 * `page_contact_config` are applied where the page is known (the product and
 * supplier pages' "ask" button, the contact page).
 */
export default async function WhatsAppFloat() {
  const storeNumber = storeWhatsAppNumber()
  if (!storeNumber) return null
  const channels = await listActiveContactChannels()
  const topics = topicsFor(channels, storeNumber)
  return <WhatsAppFloatSheet topics={topics} />
}
