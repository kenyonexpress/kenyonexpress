/**
 * THERE IS NO PUBLIC REVIEW READ, AND THAT IS A DECISION, NOT A GAP.
 *
 * This module used to read approved reviews through the anon client for the
 * product page's visible list and its JSON-LD aggregateRating. Migration 232
 * (2026-09-10) dropped `reviews_public_read_approved` and revoked anon SELECT
 * on `reviews`: per the business model review content is never displayed to
 * visitors, it only feeds admin moderation. The reads that remain live where
 * their session does:
 *
 *   - the buyer's own rows: `getMyReviewableItem` in
 *     src/server/actions/reviews.ts, on the user client, scoped by
 *     `reviews_owner_read`;
 *   - moderation: src/app/(admin)/admin/reviews/page.tsx, on the service
 *     role.
 *
 * A rebuilt public read would start by reversing 232, so this file stays as
 * the marker of why it is one migration, one policy, and one module all
 * saying the same thing. The file itself remains because deleting files is a
 * stop-and-ask action in this project and the tombstone is the answer to
 * "where did getProductReviews go".
 */
export {}
