/**
 * Cart abandonment email template.
 *
 * The email is built inline in src/app/api/cron/cart-abandonment/route.ts
 * to match the pattern used by other cron emails like weekly-digest.
 *
 * Subject: 'יש לך דיל ממתין בעגלה'
 * Content: Product thumbnails and link to resume cart
 */

export const CART_ABANDONMENT_SUBJECT = 'יש לך דיל ממתין בעגלה'

export type CartAbandonmentEmailData = {
  greeting: string
  items: Array<{
    name: string
    quantity: number
    imageUrl?: string
  }>
  cartUrl: string
}
