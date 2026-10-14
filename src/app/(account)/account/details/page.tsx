import { permanentRedirect } from 'next/navigation'

/**
 * The profile form moved to the settings hub (UX18, /account/settings) with
 * the sign-out and the cards for notifications, security, payment methods
 * and privacy. Old links (mails, bookmarks, the overview tiles sent before
 * the move) land here and go on. A 308, because the old address is not
 * coming back; the "הגדרות" tab lights for both.
 */
export default function AccountDetailsRedirect(): never {
  permanentRedirect('/account/settings')
}
