/**
 * THERE IS NO PUBLIC STAR ROW, AND THAT IS A DECISION, NOT A GAP (STEP 45).
 *
 * This component used to paint an average and a count over approved reviews
 * in the product page's rating slot, fed by `product_rating_summary` (the
 * second half of pending 235). Per the business rule ratings are collected
 * from buyers after delivery and read by the owner in /admin/reviews only;
 * nothing derived from them, not even an aggregate, is displayed to a
 * visitor. The function was removed from 235 before apply (measured
 * 2026-10-08: it never existed in production), `loadRatingSummary` left
 * src/lib/product-detail.ts, and json-ld.ts stopped emitting
 * AggregateRating, all in the same commit.
 *
 * The file remains because deleting files is a stop-and-ask action in this
 * project, and the tombstone is the answer to "where did RatingStars go".
 * src/__tests__/ratings-never-public.test.ts pins that it stays empty.
 */
export {}
