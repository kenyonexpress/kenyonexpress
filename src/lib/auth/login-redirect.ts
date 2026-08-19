/**
 * Where an anonymous visitor to a protected route is sent, and how they get
 * back afterwards.
 *
 * THE QUERY STRING IS PART OF THE DESTINATION. The proxy used to build this
 * with `nextUrl.clone()` plus `searchParams.set('next', pathname)`, which got
 * both halves wrong at once: the clone carried the ORIGINAL query onto /login,
 * where it means nothing, and `next` held the path alone, so the query was
 * dropped on the way back.
 *
 * MEASURED: `/checkout/return?order_id=<uuid>` redirected to
 * `/login?order_id=<uuid>&next=%2Fcheckout%2Freturn`. That page reads exactly
 * one thing and 404s without it - `if (!orderId) notFound()` - so a shopper
 * whose session had lapsed while they were on Cardcom's page logged back in
 * and was shown "הדף שחיפשתם לא נמצא" instead of the receipt for the payment
 * they had just made. The order id was right there in the URL the whole time,
 * one parameter to the left.
 *
 * It is not only the receipt: `/coupon/<id>`, `/account/orders?page=3` and
 * every `?tab=` in the supplier portal lose their state through the same door.
 *
 * The fragment cannot be preserved and is not missing: browsers never send it.
 */
export function loginRedirectUrl(requestUrl: URL): URL {
  const loginUrl = new URL('/login', requestUrl)
  // pathname + search, not pathname. `URL.search` is '' when there is no query,
  // so the common case still produces a bare path.
  loginUrl.searchParams.set('next', `${requestUrl.pathname}${requestUrl.search}`)
  return loginUrl
}
