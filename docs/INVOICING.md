# Invoicing: who issues the document was decided by who took the money

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

Most of this was already built and built well. `invoices` is applied and
carries the whole document lifecycle — type, status, idempotency key, net/VAT
split, document number, attempts, backoff, dead-letter alert. `finalizeOrder`
queues the sale's document and the refund action queues the credit note.
`/api/cron/invoices` retries what the money path could not issue, and it
distinguishes "the provider refused" from "there is no provider configured", so
a queue does not eat its own retries while waiting for a key.

Two things were wrong, and one asked-for thing is deliberately not built.

## The invoice provider was the payment provider

`issueInvoice` called:

```ts
getPaymentProvider(cardcomAccountId).createDocument(…)
```

That is Cardcom's document module, reached through the object that also charges
the card. So "who issues our tax documents" was not a decision anybody could
make — it was a **consequence of which terminal took the payment**.

Those are separate businesses in Israel. Most shops charge through one company
and invoice through another (חשבונית ירוקה, iCount, Rivhit), and Cardcom's
document module is a paid add-on an account may simply not have. Under the old
shape, a shop that switched acquirers switched invoice providers at the same
moment — mid-year, mid-numbering-sequence.

`src/lib/invoices/provider.ts` is the adapter layer. `INVOICE_PROVIDER` picks
one and defaults to `cardcom`, which is exactly what the code did before there
was a choice.

**An unrecognised value throws rather than falling back.** A fallback means a
typo sends every tax document to the wrong company, and the symptom is invoices
piling up in an account nobody is watching.

**The Cardcom adapter is passed as a thunk**, so it is only constructed when it
is the one selected. `getPaymentProvider` reads terminal credentials, and
building it under `INVOICE_PROVIDER=green_invoice` would make an invoice setting
fail on a payment key — an error pointing at the wrong system entirely.

**It is typed on the one method that matters** (`Pick<DocumentProvider,
'createDocument'>`), so the payment provider satisfies it as it is. Requiring
the full interface would have meant adding an `id` to `PaymentProvider` — the
payment layer carrying a field for the invoice layer's benefit, which is the
same coupling pointing the other way.

**The stubs refuse instead of pretending.** `green_invoice` and `icount` are
named with the shape they need and no request code, because a client written
against documentation nobody has opened looks finished and fails on the first
real call — and the first real call is a customer's tax receipt. They return a
refusal naming the credentials they need, which lands in `invoices.last_error`
where an operator reads it, and the queue retries rather than dying.

**The mock returns `mock-doc-…`, which could never be mistaken for a real
number.** This project runs against the hosted database, so a stray mock run
stamps whatever it returns onto a live order as that order's invoice number.
`documentIssuingMode` is what stops the mock being reached; this is the second
line.

## Sequential numbering per year is deliberately NOT implemented

It is on the spec and it is refused, with a reason.

Israeli law requires an unbroken sequence per document type per year, and what
makes a sequence acceptable to רשות המסים is that it comes out of approved
software with its own retention and audit trail. Generating our own counter
would create a **second numbering authority**: two systems that both believe
they own the sequence, diverging the first time a document is issued outside
this codebase — by an accountant, from the provider's console, for a sale that
happened by bank transfer.

So `invoices` has no sequence, no counter and no default on `document_number`,
and the column is written from `result.documentNumber` and from nowhere else.
The gap that *is* ours to close is making sure a document is always requested.
The number on it belongs to whoever is legally answerable for it.

The Hebrew RTL invoice PDF is the same delegation: the provider renders it,
because a provider-issued Hebrew tax document is what satisfies the requirement.
`mirrorPdf` copies it into R2 so the customer's link survives the provider's
link expiring — and that mirror is currently inert, because R2 is not enabled on
the Cloudflare account (`docs/IMAGE-IMPORT-STATUS.md`).

## The monthly settlement statement

`/api/supplier/payouts/csv` exported the settlement breakdown, and it exported
**all of it** — every line the supplier has ever sold, in one file, every time.
Right for "let me look at everything", wrong for what a supplier needs each
month.

Israeli bookkeeping runs on the calendar month: VAT is filed monthly or
bi-monthly, and a supplier reconciling their books needs "what did
KenyonExpress owe me for September" as its own artefact with its own total.

`/api/supplier/statement?month=YYYY-MM&format=pdf|csv`. Both formats come from
the same `buildSettlementStatement`, so a PDF handed to an accountant and a CSV
opened in a spreadsheet cannot disagree about the month's total.

**The month is Israeli, not UTC.** A sale at 01:30 on 1 October Israeli time is
22:30 on 30 September in UTC, and filing it under September puts it in a month
the supplier has already closed.

**It filters on `paidAt`, not on when the order was placed.** The statement is
about money, and money moves when the payment settles.

**An unpaid line is excluded, not filed under the current month.** Putting it in
a statement would have the supplier reconcile against a bank transfer that never
happened. It stays visible as pending in the all-time CSV.

**No month asked for means the most recent month with activity**, not "this
month" — which on the 1st is an empty download that reads as a broken feature.
`monthsWithActivity` exists so a picker can list months that have something in
them rather than a rolling twelve.

### The Hebrew PDF, and the two things that make one hard

**`pdf-lib`'s standard fonts cannot draw a single Hebrew character.**
`qr-pdf.ts` hit this first and solved it by having nothing Hebrew to draw. Heebo
is already in the repository for the web font, so it is embedded here through
`@pdf-lib/fontkit`, subsetted so a monthly download is not a megabyte of unused
glyphs.

**Text must be reordered before it is drawn, and this is the half that fails
quietly.** `drawText` paints glyphs in the order the string holds them. A
browser reorders Hebrew for display; a PDF viewer does not, because the PDF
already *is* the display. Hebrew written logically comes out mirrored — and the
output still looks like text, which is exactly why it would survive review.

`src/lib/pdf/hebrew.ts` does the reordering:

- Hebrew runs are reversed.
- **Digits are not.** `₪1,234.56` reversed is `65.432,1₪`, and a money document
  that mangles its own numbers is worse than one written in English.
- Latin runs are not, so `HFD` survives.
- Brackets inside an RTL run are mirrored, because `(סכום)` reversed without
  swapping renders `)םוכס(`.

**The neutral-resolution rule is where the first version was wrong.** A space,
a comma or a bracket has no direction of its own, and which run it belongs to
depends on what is on **both** sides. Attaching every neutral to the run before
it put the `(` of `שם (HFD)` into the Hebrew run, where it mirrored to `)` and
produced `HFD)) םש` — output that looks like text. The rule is UAX#9's: a
neutral span between two runs of the same direction takes that direction, and
between different directions it takes the paragraph direction.

It is **not** a bidi implementation — no embedding levels, no direction marks,
no paragraph resolution. It assumes an RTL paragraph, which is true of every
string this codebase draws into a PDF. Anything more general belongs in a
library, and pulling one in for a one-page statement would be the larger
mistake.

The PDF has integration tests that build the document for real, because what
cannot be unit tested is whether pdf-lib will actually embed the font — the step
that throws `WinAnsi cannot encode "ש"` at request time, in a download, on a
supplier's machine. They run under `@vitest-environment node`: under jsdom a
`Buffer` from `node:fs` belongs to a different realm than jsdom's `Uint8Array`,
so pdf-lib's `instanceof` check reports the font as "of type NaN".

## What is not done

**No document has ever been issued.** `invoices` holds 0 rows, and
`documentIssuingMode` returns `unconfigured` because the Cardcom terminal
credentials are a GO/NO-GO item that is not set. Every order that finalises
queues a document and the cron correctly declines to burn its attempts. Under
Israeli law a sale owes a receipt, so this is a launch blocker rather than a
degraded feature — and it is a credentials blocker, not a code one.

**Neither Green Invoice nor iCount is implemented.** Named, shaped, refusing.
Implementing one needs an account, an API key and a request body validated
against their API.

**The statement PDF is one page.** A month with more lines than fit says so in
a line and points at the CSV, which is the complete record. Pagination is worth
adding when a month first overflows; inventing it before then would be untested
against real data.

## Files

| | |
| --- | --- |
| `src/lib/invoices/document.ts` | the document builder and the VAT split (existing) |
| `src/lib/invoices/provider.ts` | the adapter layer and the provider choice |
| `src/lib/invoices/settlement-statement.ts` | one month, pure |
| `src/lib/invoices/settlement-pdf.ts` | the Hebrew PDF |
| `src/lib/pdf/hebrew.ts` | reordering, and what it refuses to reorder |
| `src/app/api/supplier/statement/route.ts` | the download, CSV or PDF |
| `src/server/payments/invoices.ts` | the queue, the retry and the dead-letter alert (existing) |
