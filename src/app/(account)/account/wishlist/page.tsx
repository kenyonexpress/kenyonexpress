import { redirect } from 'next/navigation'

/**
 * The wishlist moved out of the account area to `/wishlist` (STEP 12): the
 * heart is on every card for every visitor, and the page it points at has to
 * be reachable, with a sign-in prompt, without the account layout's session
 * bounce. Old links (mails sent before the move, bookmarks) land here and go
 * on. Permanent, because the old address is not coming back.
 */
export default function AccountWishlistRedirect(): never {
  redirect('/wishlist')
}
