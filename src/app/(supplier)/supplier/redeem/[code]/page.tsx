import RedeemConfirm from '@/app/redeem/[token]/RedeemConfirm'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { getSupplierMemberships } from '@/lib/supplier/rbac'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { isValidVoucherCode, normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { readScanContext, recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { getVoucherForRedemption } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * Supplier scan page for a voucher short code: /supplier/redeem/<code>.
 *
 * The (supplier) layout has already required a signed-in supplier member, so
 * this page never runs for anyone else. What it adds on top of that:
 *
 *   - the code is looked up only among the caller's own suppliers, so another
 *     business's code is reported as not found (anti-enumeration);
 *   - not-redeemed and not-expired are decided here for display and again, for
 *     real, by redeem_voucher() behind /api/supplier/vouchers/redeem: one
 *     conditional UPDATE flips the voucher and writes the voucher_redemptions
 *     row, and a unique index on (voucher_id) WHERE outcome = 'success' means a
 *     second redemption cannot be recorded. This page never writes money state;
 *   - every refusal is written to voucher_redemptions with time and address.
 *
 * A signed QR token (KEV1.…) pasted into this path is handed to /redeem/<token>,
 * which verifies the signature before anything reads the database.
 */

export const metadata: Metadata = {
  title: 'מימוש שובר',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ code: string }> }

function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5, 10)}`
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
          href="/supplier/scan"
          className="mt-6 inline-flex rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white"
        >
          למסך הסריקה
        </Link>
      </div>
    </main>
  )
}

export default function SupplierRedeemCodePage(props: Props) {
  return (
    <Suspense fallback={<main dir="rtl" className="mx-auto max-w-md px-4 py-10" />}>
      <SupplierRedeemCodeBody {...props} />
    </Suspense>
  )
}

async function SupplierRedeemCodeBody({ params }: Props) {
  const raw = decodeURIComponent((await params).code)

  if (raw.startsWith('KEV1.')) redirect(`/redeem/${encodeURIComponent(raw)}`)

  const scanContext = readScanContext(await headers())

  // Same per-address ceiling as /redeem/[token]; fails open if the limiter is down.
  if (scanContext.ip && !(await checkRateLimit(`redeem:${scanContext.ip}`, 60, 3600))) {
    return (
      <Refusal
        title="יותר מדי נסיונות"
        detail="בוצעו יותר מדי סריקות מכתובת זו בשעה האחרונה. המתינו מעט ונסו שוב."
      />
    )
  }

  const code = normalizeVoucherCode(raw)
  if (!isValidVoucherCode(code)) {
    await recordRefusedScan({
      codeEntered: code.slice(0, 64),
      outcome: 'invalid_request',
      scanMethod: 'manual',
      context: scanContext,
    })
    return (
      <Refusal
        title="קוד השובר אינו תקין"
        detail="קוד שובר מורכב מ-10 תווים (אותיות לועזיות ומספרים). בדקו את הקוד והזינו שוב."
      />
    )
  }

  // A read that failed is not a voucher that does not exist: no refusal row is
  // written for it and nothing is claimed about the code.
  let voucher: Awaited<ReturnType<typeof getVoucherForRedemption>>
  try {
    voucher = await getVoucherForRedemption(code, await getSupplierMemberships())
  } catch {
    return (
      <Refusal
        title="לא ניתן לבדוק את השובר כרגע"
        detail="התרחשה תקלה זמנית בקריאת השובר. נסו שוב בעוד רגע; לא בוצע שום שינוי בשובר."
      />
    )
  }

  if (!voucher) {
    await recordRefusedScan({
      codeEntered: code,
      outcome: 'not_found',
      scanMethod: 'manual',
      context: scanContext,
    })
    return (
      <Refusal
        title="השובר לא נמצא"
        detail="הקוד אינו משויך לבית העסק שלכם, או שאינו קיים. ודאו שאתם מחוברים לחשבון הספק הנכון."
      />
    )
  }

  return (
    <main dir="rtl" className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-gray-900">מימוש שובר</h1>
      <RedeemConfirm
        code={voucher.code}
        codeDisplay={formatCode(voucher.code)}
        status={voucher.status}
        productName={voucher.productName}
        faceValue={shekels(agorot(voucher.faceValueAgorot))}
        paidOnline={shekels(agorot(voucher.couponPriceAgorot))}
        toCollect={shekels(agorot(voucher.remainingAmountDueAgorot))}
        expiresAtLabel={formatDate(voucher.expiresAt)}
        redeemedAtISO={voucher.redeemedAt}
        expired={new Date(voucher.expiresAt).getTime() <= Date.now()}
      />
    </main>
  )
}
