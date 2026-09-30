import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSupplierMemberships, getSupplierSession } from '@/lib/supplier/rbac'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { isVoucherId } from '@/lib/vouchers/coupon-path'
import { resolveEnteredVoucherCode } from '@/server/domain/vouchers/fallback-code'
import { readScanContext, recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { getVoucherForRedemption, getVoucherForRedemptionById } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import RedeemConfirm from '../../redeem/[token]/RedeemConfirm'

/**
 * The merchant validation page (STEP 14): what a business sees when it has
 * a voucher in front of it and no working camera.
 *
 * The segment is whatever the till has: the voucher's id (a UUID from the
 * customer's screen or an email), the ten-symbol code, or the 8-digit
 * fallback code (251). Shape decides which, nothing is guessed, and all
 * three land on the same confirm screen as a scanned QR (/redeem/[token]),
 * so the two doors cannot drift: same money lines, same status labels, same
 * single burn request with one idempotency key per mount.
 *
 * WHAT IT DECIDES: nothing. It shows the voucher's state - live, already
 * used with its date, lapsed, cancelled, refunded - and a button. Pressing
 * the button POSTs the ten-symbol code to /api/supplier/vouchers/redeem,
 * where redeem_voucher() re-derives the supplier from supplier_members,
 * re-checks status and expiry and flips the row in one conditional UPDATE.
 * A second press, a second tab, a second cashier: already_redeemed, decided
 * by the database and not by this page.
 *
 * WHO SEES IT: a signed-in member of the voucher's own supplier. The proxy
 * bounces a stranger to login before this renders; a member of another
 * business gets "not found", the same anti-enumeration collapse the RPC
 * performs, and the miss is recorded with time and address. Unlike
 * /redeem/[token] there is no signature to verify before the session
 * check, because nothing here is signed.
 *
 * Authoritative document: docs/VOUCHER-LIFECYCLE.md sections 3 and 4.
 */

export const metadata: Metadata = {
  title: 'אימות שובר',
  // A voucher's balance is not a page to index: id or code in the path.
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

function formatCode(code: string): string {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5, 10)}` : code
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function Refusal({ title, detail }: { title: string; detail: string }) {
  return (
    <main dir="rtl" className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="mb-3 text-4xl" aria-hidden="true">
          ⚠️
        </p>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{detail}</p>
        <Link
          href="/scan"
          className="mt-6 inline-flex rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white"
        >
          למסך הסריקה
        </Link>
      </div>
    </main>
  )
}

/**
 * Same shape as /redeem/[token]: the segment picks between a voucher, a
 * refusal and a rate limit, and the limit is keyed on the caller's address,
 * so there is no shared answer to prerender.
 */
export default function VoucherValidationPage(props: Props) {
  return (
    <Suspense fallback={<main dir="rtl" className="mx-auto max-w-md px-4 py-10" />}>
      <VoucherValidationBody {...props} />
    </Suspense>
  )
}

async function VoucherValidationBody({ params }: Props) {
  const { id } = await params
  const segment = safeDecode(id)
  const scanContext = readScanContext(await headers())

  // 0. Per-address ceiling, the redeem page's own number: 60 an hour is far
  //    above a till and far below anything useful for walking the 8-digit
  //    space (which the Luhn digit already thins nine in ten). Fails OPEN
  //    when the limiter is down, so a customer at a counter is never refused
  //    by an outage in a guard.
  if (scanContext.ip) {
    const allowed = await checkRateLimit(`voucher-page:${scanContext.ip}`, 60, 3600)
    if (!allowed) {
      return (
        <Refusal
          title="יותר מדי נסיונות"
          detail="בוצעו יותר מדי בדיקות מכתובת זו בשעה האחרונה. המתינו מעט ונסו שוב."
        />
      )
    }
  }

  // 1. A session, then a membership. The proxy already bounced a stranger;
  //    this is the page keeping its own promise if the proxy is restructured.
  //    Reads throw rather than answer null on failure (see queries/vouchers),
  //    so an outage is told apart from "not yours".
  let session: Awaited<ReturnType<typeof getSupplierSession>>
  let voucher: Awaited<ReturnType<typeof getVoucherForRedemption>>
  let entered = ''
  try {
    session = await getSupplierSession()
    if (!session) {
      voucher = null
    } else {
      const memberships = await getSupplierMemberships()
      if (isVoucherId(segment)) {
        voucher = await getVoucherForRedemptionById(segment, memberships)
      } else {
        // Ten symbols pass through; eight digits resolve to them (251);
        // anything else is a miss without a read.
        const resolved = await resolveEnteredVoucherCode(
          segment,
          () => createAdminClient() as never,
        )
        entered = resolved.entered
        voucher = resolved.code ? await getVoucherForRedemption(resolved.code, memberships) : null
      }
    }
  } catch {
    return (
      <Refusal
        title="לא ניתן לבדוק את השובר כרגע"
        detail="התרחשה תקלה זמנית בקריאת השובר. נסו שוב בעוד רגע; לא בוצע שום שינוי בשובר."
      />
    )
  }

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/voucher/${encodeURIComponent(segment)}`)}`)
  }

  if (!voucher) {
    await recordRefusedScan({
      codeEntered: entered,
      outcome: 'not_found',
      scanMethod: 'manual',
      context: scanContext,
    })
    return (
      <Refusal
        title="השובר לא נמצא"
        detail="הקוד אינו משויך לבית העסק שלכם, או שאינו קיים. בדקו את הספרות מול הלקוח, או ודאו שאתם מחוברים לחשבון הספק הנכון."
      />
    )
  }

  return (
    <main dir="rtl" className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">אימות שובר</h1>
        <p className="text-sm text-gray-500">{session.supplierName}</p>
      </header>

      <RedeemConfirm
        code={voucher.code}
        codeDisplay={formatCode(voucher.code)}
        status={voucher.status}
        productName={voucher.productName}
        customerName={voucher.customerName}
        faceValue={shekels(agorot(voucher.faceValueAgorot))}
        paidOnline={shekels(agorot(voucher.couponPriceAgorot))}
        toCollect={shekels(agorot(voucher.remainingAmountDueAgorot))}
        expiresAtLabel={formatDate(voucher.expiresAt)}
        redeemedAtLabel={voucher.redeemedAt ? formatDate(voucher.redeemedAt) : null}
        expired={new Date(voucher.expiresAt).getTime() <= Date.now()}
      />
    </main>
  )
}

/** The segment as typed; a stray percent sign is not a reason to 500. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
