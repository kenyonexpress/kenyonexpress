# Reviews: a dormant grant, woken by a new policy

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

**`reviews` holds 0 rows.** Everything below — everything 154 shipped and
everything added here — is inert until a customer writes the first one. That is
stated at the top rather than buried, because "the reply feature works" and "the
reply feature has never had a review to reply to" are different claims and only
the second is true today.

154 shipped the hard parts and shipped them well: a verified-purchase INSERT
policy keyed on `order_item_id` and the order's status, a moderation `status`, a
soft delete, an admin queue, and (with 189) one review per customer per product.
The product page renders an `AggregateRating` and omits it below one review.

## The finding: what a new policy does to an old grant

`authenticated` already held a **table-wide UPDATE grant** on `reviews`, over
every column. It was inert for exactly one reason: there was no UPDATE policy on
the table, so RLS denied every UPDATE regardless of the grant.

Adding a supplier reply policy **ends that**. The first draft of migration 199
did precisely that, and a probe against production came back:

```
rewrite_body=ALLOWED
```

A supplier could have rewritten the **rating and the body** of a review about
their own business. The column grant beneath — `GRANT UPDATE (supplier_reply,
supplier_replied_at, supplier_replied_by)` — was not wrong; it was never
reached, because the wider grant already covered every column.

This is the shape migration 172's RESTRICTIVE policies were installed for,
arriving from the other direction: **a grant that protects nothing until
somebody adds a policy, at which point it protects nothing.** A grant audit that
asked "is this dangerous today" would have said no, correctly, and been wrong
about tomorrow.

`REVOKE UPDATE ON public.reviews FROM authenticated` is the fix, and it is safe
precisely because nothing consults it. Re-probed:

```
update_grants=3  own_reply=ALLOWED  rewrite_body=REFUSED
foreign_reply=NO ROWS  duplicate_report=REFUSED  read_queue=REFUSED
```

## The supplier's answer

Two mechanisms, both needed, neither sufficient alone:

- **the RLS policy** proves the membership, joining `products.supplier_id` to
  `supplier_members` — without it any supplier could reply to any review;
- **the column grant** restricts the UPDATE to the three reply columns —
  without it a supplier could edit the review itself.

The write goes through the **request-scoped** client, so the database enforces
both. Reaching for the service role would bypass them and leave "may this
supplier edit this review, and which columns" as a TypeScript condition somebody
has to get right every time.

**A review that is not theirs comes back as zero rows, and is reported as "not
found" rather than "forbidden."** Forbidden confirms the id exists, and lets a
supplier enumerate other suppliers' reviews one guess at a time. Same rule as
the shipping action.

**The reply invalidates `CATALOGUE_TAG`.** Without it a reply would take up to
an hour to appear beneath the review it answers — and the supplier, seeing their
own portal update immediately, would have no way to tell. The repository's
cache-invalidation gate caught this before it shipped.

**Editing replaces.** `supplier_reply` is one column; there is no thread and no
history. The form shows the current text so that is visible, because a blank box
beside a published reply suggests the next thing typed is added rather than
substituted.

**The supplier's read is filtered in code and the write in the database, and
that inconsistency is deliberate.** `reviews`'s public SELECT policy is
`status = 'approved'` with no supplier dimension at all — a supplier reading
through their own session would see every approved review on the site. So the
list is read with the service role and narrowed by `products.supplier_id` in the
query. The write has a policy that carries the check, so it does not need to.
Each filter lives where it can actually be enforced.

## The reader's objection

A moderation queue that sees only what an admin happens to open is not
moderation. The person who notices that a review names a member of staff, or is
somebody's phone number, is a reader — and until now a reader had no way to say
so.

**One report per person per review**, by unique index: a second click is the
same objection, and counting it twice would let one reader make a review look
widely objected to.

**A reporter may file and may not read the queue.** `review_reports` grants
INSERT and nothing else. Letting somebody read their own report back tells them
whether an admin has acted, which turns a moderation decision into a negotiation
with whoever objected loudest.

**Resolved, not deleted.** "We looked and it was fine" is the answer that stops
the same review being re-queued by the next report, and it is only expressible
if the row survives.

**The answer is the same sentence whatever happened** — filed, already filed,
unknown review, table not applied. Anything more specific would let the control
be used to ask whether a particular account had already objected to a particular
review.

**Rate limited at 20/hour per IP**, higher than the mail-sending forms because
it sends nothing. The ceiling stops one person objecting to two hundred reviews
in a sitting, which turns the moderation queue into a denial of service against
the admin reading it. The unique index handles the other direction.

**The control is collapsed behind a `<details>`.** A report button under every
review invites reports; a shopper reading about a massage is not looking for a
moderation tool, and putting one in their eyeline changes what the page is
about.

## The supplier page had no structured data at all

Every product page has carried a `Product` node with an `aggregateRating` since
154. The **business behind those products** had none — so a spa with eleven
products was invisible to a map result.

`buildSupplierJsonLd` emits `LocalBusiness`, not `Organization`: these are spas,
restaurants and cabins with an address a customer drives to, and
`LocalBusiness` is the type that makes an address meaningful.

**The address is omitted when there is nothing to put in it.** Measured: of
twelve suppliers, **zero** have an address and six have a phone. A
`PostalAddress` with an empty `streetAddress` is a claim about a location we do
not have and a structured-data error for engines that check — worse than the
absence, because the absence is honest.

**The rating folds every approved review across the supplier's products**, which
is the honest aggregate for a business: a shopper judging a spa does not care
which of its three treatments a review was left on. Not capped and not paged —
an average that stopped at a page boundary would be an average of whichever
reviews sorted first, a number that looks precise and means nothing. Omitted
entirely below one review, which is the branch every supplier takes today.

## Reading a review list across two optional migrations

`title` ships in 189 and the reply columns in 199, so a deployment can
legitimately have neither, the first, or both. Naming a column this database
lacks fails the **whole** select with 42703 — which would empty a list of real
reviews to hide one optional field, an outage this codebase has already shipped
twice.

The read is a **ladder**, not a probe, because the column sets are nested: each
rung drops the newest optional column and retries, ordered newest-migration
first so a fully migrated deployment succeeds on the first attempt and pays
nothing.

## What is not done

**Photos.** The spec asks for review photos in R2, and R2 is not enabled on the
Cloudflare account — measured four times through two independent code paths,
documented in `docs/IMAGE-IMPORT-STATUS.md`. The destination bucket cannot
exist. Skipped under the standing rule for a goal that sticks twice.

**Sort and filter.** With zero reviews, a sort control is a control over
nothing. The list is newest-first and capped at twenty; the aggregate is
computed over all of them, so the summary is already correct regardless of what
the list shows. Worth building when a product has enough reviews for the order
to matter.

**Nothing writes a `notifications` row when a review is replied to.** A customer
whose review gets an answer is not told. That needs 198's table and the
in-app writer named in `docs/NOTIFICATIONS.md`, and adding it before then would
put `42P01` handling in a second place.

## Files

| | |
| --- | --- |
| `migrations/applied/199_review_replies_and_reports.sql` | reply columns, reports, and the revoke. **Applied** (corrected 2026-09-09). |
| `src/server/actions/supplier/reviews.ts` | the reply, through the customer's own role |
| `src/app/(supplier)/supplier/reviews/` | the supplier's list and reply box |
| `src/server/actions/reviews-report.ts` | the objection, one answer for every outcome |
| `src/components/product/ReportReview.tsx` | collapsed, five fixed reasons |
| `src/components/product/Reviews.tsx` | the reply rendered under the review |
| `src/server/queries/reviews.ts` | the column ladder, and the supplier-wide rating |
| `src/lib/seo/json-ld.ts` | `buildSupplierJsonLd` |

---

## 2026-09-09: 199 was applied all along, and two counters were missing

**199 is applied.** It was filed in `migrations/pending/` and every object it
declares is in production, verified one at a time rather than by the table
existing: the `reviews_supplier_reply_length` CHECK, all three
`review_reports` indexes, the `reviews_supplier_reply` UPDATE policy, and the
grants that are the real boundary here - `review_reports` is INSERT-only to
`authenticated`, and on `reviews` the UPDATE grant is scoped to exactly
`supplier_reply`, `supplier_replied_at` and `supplier_replied_by`. It has been
moved to `migrations/applied/`.

### The aggregate rating had no cache, and the read-time version has a horizon

`getRatingSummaries` selected every approved row for the products on screen and
folded them in TypeScript. Correct today, with `reviews` at zero rows and 44
active products. It does not stay correct: the read has no `.limit()`, so it
inherits PostgREST's server-side row ceiling, and past it the average is
computed over **whichever approved rows came back**. It keeps its one decimal
place, it looks precise, and nothing raises.

`221_review_rating_cache.sql` adds `rating_sum` + `rating_count` to `products`,
maintained by trigger. **Sum and count, not a stored average**, because only
those can be updated from a delta; an average would force the trigger to rescan
every review for the product, which is the cost the cache exists to remove.

The two transitions a naive trigger gets wrong are the only two that will ever
happen on this site: every review arrives `pending`, so approval is an UPDATE of
`status` rather than an INSERT, and 185 made removal a soft delete rather than a
DELETE. Both are probed, along with rating edits and a `product_id` move.

`getRatingSummaries` now reads the cache and falls back to the fold on 42703,
so it behaves identically until 221 is applied.

### "Sort by helpful" needed something to count

`222_review_helpful_votes.sql`. One row per person per review, keyed
`(review_id, user_id)`. **The primary key is the anti-abuse design**: a rate
limit slows a second vote down, and a key makes it impossible. The probe
confirms the second vote takes a `unique_violation`.

Votes are readable only by the voter who cast them. Who found what helpful is a
behavioural trace, and publishing it would let anyone build a profile of any
customer straight off the catalogue. The COUNT is public; the votes are not.

The sort is **a pair of links and not a `<select>`**, because this section
renders inside the cached catalogue tree: the order has to be in the URL for the
two orderings to be separately cacheable, and a select would need client
JavaScript to achieve the same thing. Until 222 is applied, asking for "most
helpful" returns the recency order, which is the same list - nothing can have
been voted helpful on a database with no votes table.
