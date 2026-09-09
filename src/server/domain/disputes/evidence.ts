/**
 * The chargeback evidence pack.
 *
 * WHAT ACTUALLY WINS ONE OF THESE, for this business specifically. The card
 * scheme's question is "did the cardholder get what they paid for", and for a
 * coupon shop the strongest answer is not the receipt and not the terms
 * checkbox: it is **the voucher was scanned at the supplier's counter**, at a
 * time, by a named staff member, from an address. `voucher_redemptions` records
 * every one of those and nothing has ever assembled them into an argument. That
 * is what this file is for, and it is why redemption sits at the top of the
 * pack rather than in an appendix.
 *
 * PURE, AND THAT IS WHAT MAKES IT TESTABLE AS EVIDENCE. It takes rows and
 * returns a document. No client, no clock beyond the one passed in - so a test
 * can assert that a redeemed voucher produces the redemption paragraph and that
 * an unredeemed one does not silently produce it anyway, which is the failure
 * mode that would matter: a pack that claims delivery we cannot prove is worse
 * than no pack, because it is submitted under our name.
 *
 * ABSENCE IS STATED, NEVER OMITTED. Every section that has no rows says so in
 * words. A missing paragraph reads as an oversight to whoever assembles the
 * response; "no redemption was recorded" reads as a fact, and it is the fact
 * that tells the operator to settle rather than to fight.
 */

export type EvidenceOrder = {
  id: string
  status: string
  createdAt: string
  paidAt: string | null
  acceptedTermsAt: string | null
  totalAgorot: number | null
  customerEmail: string | null
  customerName: string | null
}

export type EvidenceItem = {
  productName: string
  quantity: number
  totalAgorot: number
  supplierName: string | null
}

export type EvidencePayment = {
  id: string
  status: string
  createdAt: string
  transactionId: string | null
  last4: string | null
  amountAgorot: number | null
}

export type EvidenceRedemption = {
  code: string
  outcome: string
  at: string
  supplierName: string | null
  staffName: string | null
  scanMethod: string | null
  ip: string | null
}

export type EvidenceInput = {
  dispute: {
    providerRef: string
    kind: string
    amountAgorot: number
    openedAt: string
    respondBy: string
    reasonCode: string | null
    notes: string | null
  }
  order: EvidenceOrder
  items: EvidenceItem[]
  payments: EvidencePayment[]
  redemptions: EvidenceRedemption[]
  refundRequests: Array<{ status: string; reasonCode: string; createdAt: string }>
  generatedAt: Date
}

export type EvidenceSection = {
  title: string
  /** Lines of prose. Empty is impossible: absence is a line. */
  lines: string[]
  /**
   * Whether this section is EVIDENCE THE CARDHOLDER RECEIVED WHAT THEY PAID
   * FOR, which is the only question a scheme decides a chargeback on.
   *
   * THE BAR IS DELIBERATELY HIGH AND ALMOST EVERYTHING FAILS IT. The order
   * existing, the charge succeeding, the terms checkbox and the item list are
   * all in the pack and all `false`, because none of them is contested: nobody
   * disputes that they were billed, and every merchant on earth has a terms
   * checkbox. If any of those counted, `defensible` would be true for every
   * dispute and the warning built on it would mean nothing - which is exactly
   * what the first version of this file did, and what the test below caught.
   *
   * For a coupon shop there is essentially one fact that clears this bar: the
   * voucher was scanned at the supplier's counter. That is a hard thing to
   * hear, and it is the thing worth telling an operator before they spend two
   * days writing a response they cannot win.
   */
  supportive: boolean
}

export type EvidencePack = {
  reference: string
  generatedAt: string
  sections: EvidenceSection[]
  /** True when at least one section evidences that the customer received it. */
  defensible: boolean
}

const ils = (agorot: number | null): string =>
  agorot === null ? 'לא ידוע' : `₪${(agorot / 100).toFixed(2)}`

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'לא ידוע'

export function buildEvidencePack(input: EvidenceInput): EvidencePack {
  const sections: EvidenceSection[] = []

  sections.push({
    title: 'התיק',
    supportive: false,
    lines: [
      `מספר תיק אצל הסולק: ${input.dispute.providerRef}`,
      `סוג: ${input.dispute.kind}`,
      `סכום במחלוקת: ${ils(input.dispute.amountAgorot)}`,
      `נפתח: ${when(input.dispute.openedAt)}`,
      `יש להשיב עד: ${when(input.dispute.respondBy)}`,
      input.dispute.reasonCode
        ? `קוד סיבה מהסולק: ${input.dispute.reasonCode}`
        : 'הסולק לא מסר קוד סיבה.',
    ],
  })

  sections.push({
    title: 'ההזמנה',
    // The order existing is not an argument by itself: nobody disputes that a
    // charge happened. Marked unsupportive so it cannot inflate the verdict.
    supportive: false,
    lines: [
      `מזהה הזמנה: ${input.order.id}`,
      `מצב: ${input.order.status}`,
      `נוצרה: ${when(input.order.createdAt)}`,
      `שולמה: ${when(input.order.paidAt)}`,
      `סכום: ${ils(input.order.totalAgorot)}`,
      input.order.customerEmail
        ? `הלקוח: ${input.order.customerName ?? ''} <${input.order.customerEmail}>`.trim()
        : 'לא נמצאה כתובת מייל ללקוח.',
    ],
  })

  /**
   * THE SECTION THAT WINS OR LOSES THE CASE.
   *
   * A successful redemption is the cardholder, or somebody holding their
   * voucher, standing at the supplier's counter. Only `redeemed` outcomes are
   * counted as supportive: a failed scan proves somebody TRIED, which is not
   * the same claim and must not be dressed as one.
   */
  const successful = input.redemptions.filter((r) => r.outcome === 'redeemed')
  sections.push({
    title: 'מימוש השובר אצל בית העסק',
    supportive: successful.length > 0,
    lines:
      successful.length > 0
        ? successful.map(
            (r) =>
              // ONE template literal, not five joined with `+`. Concatenating
              // template literals with `+` has already corrupted a production
              // build on this project once - the served string came back with
              // text missing, a 200, and no log line.
              `שובר ${r.code} מומש ב-${when(r.at)}${r.supplierName ? ` אצל ${r.supplierName}` : ''}${
                r.staffName ? `, על ידי ${r.staffName}` : ''
              }${r.scanMethod ? ` (${r.scanMethod})` : ''}${r.ip ? `, מכתובת ${r.ip}` : ''}.`,
          )
        : input.redemptions.length > 0
          ? [
              `נרשמו ${input.redemptions.length} ניסיונות סריקה, אף אחד מהם לא הסתיים במימוש.`,
              'ניסיון סריקה אינו הוכחה לקבלת השירות.',
            ]
          : ['לא נרשם אף מימוש של שובר בהזמנה הזו.'],
  })

  sections.push({
    title: 'מה נרכש',
    // A list of what was ordered is context, not proof of delivery.
    supportive: false,
    lines:
      input.items.length > 0
        ? input.items.map(
            (item) =>
              `${item.quantity} × ${item.productName}${
                item.supplierName ? ` (${item.supplierName})` : ''
              } — ${ils(item.totalAgorot)}`,
          )
        : ['לא נמצאו שורות בהזמנה. זו תקלה בנתונים ולא ראיה.'],
  })

  sections.push({
    title: 'החיוב',
    // The charge going through is the thing being disputed, not an answer to it.
    supportive: false,
    lines:
      input.payments.length > 0
        ? input.payments.map(
            (p) =>
              `${when(p.createdAt)}: ${p.status}, ${ils(p.amountAgorot)}${
                p.transactionId ? `, אסמכתת עסקה ${p.transactionId}` : ''
              }${p.last4 ? `, כרטיס שמסתיים ב-${p.last4}` : ''}`,
          )
        : ['לא נמצאה רשומת תשלום.'],
  })

  /**
   * The terms checkbox. Weak evidence and deliberately marked as such: every
   * merchant has one, and no scheme has ever decided a case on it. It is here
   * because its ABSENCE is worth knowing before submitting a response that
   * relies on the cancellation policy.
   */
  sections.push({
    title: 'אישור התנאים',
    supportive: false,
    lines: [
      input.order.acceptedTermsAt
        ? `הלקוח אישר את תנאי השימוש ומדיניות הביטולים ב-${when(input.order.acceptedTermsAt)}.`
        : 'לא נרשם אישור תנאים על ההזמנה הזו.',
    ],
  })

  /**
   * Prior refund requests, and this section can cut BOTH ways - which is why it
   * is in the pack rather than left out of it. A customer who never asked us
   * for anything and went straight to their bank is a point in our favour, and
   * the operator should know that. A customer we refused three times is a point
   * against us, and the operator should know that BEFORE they argue, not after
   * the acquirer raises it.
   */
  sections.push({
    title: 'פניות קודמות של הלקוח',
    // Cuts both ways and settles nothing, so it never sets `defensible`. It is
    // in the pack because the operator needs to know which way it cuts BEFORE
    // they argue, not after the acquirer raises it.
    supportive: false,
    lines:
      input.refundRequests.length > 0
        ? input.refundRequests.map(
            (r) => `${when(r.createdAt)}: בקשת החזר (${r.reasonCode}) — ${r.status}`,
          )
        : ['הלקוח לא פנה אלינו בבקשת החזר לפני פתיחת התיק. נקודה לטובתנו, אך לא ראיה.'],
  })

  if (input.dispute.notes) {
    sections.push({
      title: 'הערות המפעיל',
      supportive: false,
      lines: input.dispute.notes.split('\n').filter((line) => line.trim().length > 0),
    })
  }

  return {
    reference: input.dispute.providerRef,
    generatedAt: input.generatedAt.toISOString(),
    sections,
    defensible: sections.some((section) => section.supportive),
  }
}

/** The pack as plain text, which is what gets pasted into an acquirer's form. */
export function evidencePackText(pack: EvidencePack): string {
  const header = [
    `תיק ${pack.reference}`,
    `הופק: ${new Date(pack.generatedAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`,
    pack.defensible
      ? ''
      : 'אזהרה: אין בתיק הזה ראיה שהלקוח קיבל את מה ששילם עליו. שקלו לקבל את החיוב במקום להשיב.',
  ].filter(Boolean)

  const body = pack.sections.map(
    (section) => `## ${section.title}\n${section.lines.map((line) => `- ${line}`).join('\n')}`,
  )

  return [...header, '', ...body].join('\n')
}
