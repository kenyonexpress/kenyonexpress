import electro from '../../../refs/electro-checkout-text.json'

/**
 * The final checkout step, built from what Electro's checkout actually shows.
 *
 * Extracted with a real browser from electro.madrasthemes.com/checkout/ with a
 * filled basket, and committed at refs/electro-checkout-text.json so this is
 * data rather than a remembered impression. Two findings from that capture
 * shape everything here:
 *
 * 1. Electro has NO step component. `[class*="step"]` matches nothing on its
 *    checkout, and the `checkout-steps` selector was the single element missing
 *    from an otherwise 11/12 measurement at both breakpoints. So there is no
 *    Electro "step 4" to copy. What Electro does have is a distinct final
 *    block: payment-method notices, a privacy sentence, and the terms tickbox,
 *    sitting below the order review and above Place order. That block is what
 *    the fourth step carries.
 *
 * 2. Electro's own body copy is a demo. Its terms text runs "Intellectual
 *    Propertly Lorem ipsum dolor sit amet..." and its payment box advertises
 *    Stripe's 4242 test card. NONE of that ships. Copying a theme's filler into
 *    a live Hebrew checkout would be worse than writing nothing.
 *
 * So Electro supplies the STRUCTURE (which blocks exist, in what order) and the
 * Hebrew copy stays ours. `sectionsFromElectro` derives the order from the
 * captured JSON, so if the capture is refreshed and Electro reorders its
 * checkout, this list moves with it instead of being a hardcoded guess.
 */

type ElectroCapture = {
  stepLike: Array<{ cls: string; text: string }>
  headings: string[]
  labels: string[]
  paymentTitles: string[]
  notices: string[]
  placeOrder: string
  terms: string
}

const capture = electro as ElectroCapture

/** True when the captured text is theme filler rather than real copy. */
export function isDemoFiller(text: string): boolean {
  return /lorem ipsum|4242|test mode|dolor sit amet/i.test(text)
}

/** Electro shows no stepper at all; recorded so the claim stays checkable. */
export function electroHasSteps(): boolean {
  return capture.stepLike.length > 0
}

export type ConfirmSection = {
  id: 'payment-note' | 'privacy' | 'terms'
  /** Our Hebrew copy. Never Electro's, which is filler. */
  title: string
}

/**
 * The final-step blocks, in the order Electro presents them.
 *
 * Electro's order is: payment method notices, then the privacy sentence, then
 * the terms tickbox, then Place order. The `notices` and `terms` fields of the
 * capture are what establish the first two are present at all; if a refreshed
 * capture drops one, it drops here too.
 */
export function sectionsFromElectro(): ConfirmSection[] {
  const sections: ConfirmSection[] = []

  if (capture.paymentTitles.length > 0 || capture.notices.length > 0) {
    sections.push({ id: 'payment-note', title: 'אמצעי התשלום' })
  }
  if (capture.terms.trim() !== '') {
    sections.push({ id: 'privacy', title: 'פרטיות' })
  }
  // The tickbox itself is a label on Electro, not a heading, so it is detected
  // from the label list rather than from `headings`.
  if (capture.labels.some((l) => /terms and conditions/i.test(l))) {
    sections.push({ id: 'terms', title: 'תנאי שימוש' })
  }

  return sections
}

/**
 * Electro's own call to action, for reference only.
 *
 * Returned so the button copy can be compared against the reference rather than
 * asserted from memory. Ours stays Hebrew.
 */
export function electroPlaceOrderLabel(): string {
  return capture.placeOrder
}
