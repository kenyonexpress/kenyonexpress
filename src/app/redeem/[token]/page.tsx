import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { getSupplierMemberships, getSupplierSession } from '@/lib/supplier/rbac'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { normalizeVoucherCode } from '@/server/domain/vouchers/code'
import { verifyVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { readScanContext, recordRefusedScan } from '@/server/domain/vouchers/scan-context'
import { getVoucherForRedemption } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import RedeemConfirm from './RedeemConfirm'

/**
 * The screen a supplier lands on from a scanned voucher QR.
 *
 * The token in the path is the signed QR payload minted at issue
 * (`KEV1.<body>.<HMAC-SHA256>`, see domain/vouchers/qr.ts). It proves the
 * platform produced this voucher. It is NOT an authorization token and it is
 * not a bearer credential: holding a valid one lets you SEE nothing until you
 * are signed in as a member of that voucher's supplier, and single use is
 * decided by one conditional UPDATE inside redeem_voucher(), never by this
 * page. Anyone can photograph a customer's QR; nobody but the business it was
 * sold against can spend it.
 *
 * Four refusals, all recorded with time and address in voucher_redemptions:
 *   forged or tampered token  -> invalid_signature, even with no session
 *   no supplier session       -> bounced to /login and back here
 *   another supplier's code   -> reported as not found (anti-enumeration)
 *   already used / expired    -> shown honestly, to the owning supplier only
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md sections 4, 7.1.
 */

export const metadata: Metadata = {
  title: 'מימוש שובר',
  // A voucher link must never be indexed or previewed: the path is the token.
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

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
 * The shell is the column this page renders every outcome into, and nothing
 * else. The token in the path decides between a voucher, a refusal and a rate
 * limit, and the rate limit is keyed on the caller's address, so there is no
 * shared answer to prerender.
 */
export default function RedeemTokenPage(props: Props) {
  return (
    <Suspense fallback={<main dir="rtl" className="mx-auto max-w-md px-4 py-10" />}>
      <RedeemTokenBody {...props} />
    </Suspense>
  )
}

async function RedeemTokenBody({ params }: Props) {
  const { token } = await params
  const scanContext = readScanContext(await headers())

  // 0. Per-address ceiling, before the HMAC is even computed.
  //
  //    redeem_voucher() already rate limits by user, but that only binds a
  //    caller who has a session; this page answers before one is required, on
  //    purpose, so that a forged token gets recorded. Without a second limit
  //    keyed on the address, an anonymous client could ask this route to verify
  //    signatures and write audit rows as fast as it liked.
  //
  //    60 an hour is far above a real counter - a busy till scans a handful a
  //    minute in bursts and stops - and far below anything useful for probing
  //    the token space. checkRateLimit fails OPEN if its RPC is unavailable,
  //    which is the right way round here: a rate limiter that is down must not
  //    stop a paying customer redeeming at a till.
  if (scanContext.ip) {
    const allowed = await checkRateLimit(`redeem:${scanContext.ip}`, 60, 3600)
    if (!allowed) {
      return (
        <Refusal
          title="יותר מדי נסיונות"
          detail="בוצעו יותר מדי סריקות מכתובת זו בשעה האחרונה. המתינו מעט ונסו שוב, או הזינו את הקוד ידנית במסך הסריקה."
        />
      )
    }
  }

  // 1. Signature first, before anything reads the database. A tampered token is
  //    logged even from a visitor with no session at all - that is the attempt
  //    most worth having on record.
  const verified = verifyVoucherQrPayload(decodeURIComponent(token))
  if (!verified) {
    await recordRefusedScan({
      codeEntered: '',
      outcome: 'invalid_signature',
      scanMethod: 'camera',
      context: scanContext,
    })
    return (
      <Refusal
        title="קוד השובר אינו תקין"
        detail="הקישור אינו נושא חתימה תקפה של KenyonExpress. אם סרקתם QR מהטלפון של הלקוח, בקשו ממנו לפתוח מחדש את השובר באזור האישי."
      />
    )
  }

  const code = normalizeVoucherCode(verified.c)

  // 2. Only now is a session required. The order matters: asking to sign in
  //    first would send a forged token through a login round trip and lose the
  //    record of it.
  const session = await getSupplierSession()
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/redeem/${token}`)}`)
  }

  const supplierIds = await getSupplierMemberships()

  // A READ THAT FAILED IS NOT A VOUCHER THAT DOES NOT EXIST. Without this the
  // failure took the branch below: a customer who has already paid is told the
  // code is not theirs, and a refusal row is written saying so - into the log
  // that exists so a disputed scan can be reconstructed. The throw is already
  // logged, once, by the query.
  let voucher: Awaited<ReturnType<typeof getVoucherForRedemption>>
  try {
    voucher = await getVoucherForRedemption(code, supplierIds)
  } catch {
    return (
      <Refusal
        title="לא ניתן לבדוק את השובר כרגע"
        detail="התרחשה תקלה זמנית בקריאת השובר. נסו לסרוק שוב בעוד רגע; לא בוצע שום שינוי בשובר."
      />
    )
  }

  if (!voucher) {
    await recordRefusedScan({
      codeEntered: code,
      outcome: 'not_found',
      scanMethod: 'camera',
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
      <header className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">מימוש שובר</h1>
        <p className="text-sm text-gray-500">{session.supplierName}</p>
      </header>

      <RedeemConfirm
        token={token}
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
