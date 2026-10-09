import ReviewFormGate from './ReviewFormGate'

/**
 * The review section is a submission point, not a display. Per the business
 * model no review content is shown to visitors -- migration 232 revoked the
 * anon read that used to feed an approved list and a JSON-LD rating here, and
 * this component stopped rendering them in the same commit. A verified buyer
 * with an unspent review slot gets the form (the gate answers that after
 * paint, through a server action); everyone else gets nothing. The rows are
 * read in /admin/reviews on the service role, which is the only audience.
 */
export default function Reviews({ productId }: { productId: string }) {
  return <ReviewFormGate productId={productId} />
}
