import { log } from '@/lib/observability/log'

/**
 * 3-D Secure wiring for the legacy Cardcom interface.
 *
 * WHERE THE CHALLENGE ACTUALLY RUNS. The hosted Low Profile page is the only
 * surface that can show an issuer challenge (CHECKOUT-COMPLETE.md section 3.3):
 * the ACS iframe is Cardcom's, never ours, which is what keeps the integration
 * SAQ-A. A server-to-server `ChargeToken.aspx` call has no browser attached, so
 * when an issuer insists on a challenge for a saved-card charge the only honest
 * move is to send the shopper to the hosted page and let it run there. This
 * module supplies both halves of that: the field asking the hosted page for
 * 3DS, and the recognizer that tells a "come back with a challenge" decline
 * apart from an ordinary one.
 *
 * FIELD NAMES ARE THE BILLGOLD SITUATION AGAIN. There are no CARDCOM_*
 * credentials on this machine and the only doc in the repo describes the v11
 * JSON API, so `ThreeDSecureState` below is the legacy spelling and is NOT
 * confirmed against a live terminal. Same containment as `createDocument`:
 * one place, env-driven, and the DEFAULT IS TO SEND NOTHING, so an
 * unconfigured deployment keeps the terminal's own 3DS setting rather than
 * overriding live behaviour with a guess.
 */

const THREE_DS_STATE_VALUES: Record<string, string> = {
  auto: 'Auto',
  enabled: 'Enable',
  disabled: 'Disable',
}

/**
 * Extra form fields for `LowProfile.aspx`, from `CARDCOM_3DS_STATE`.
 *
 * Unset (or blank) means "send nothing": the terminal's dashboard
 * configuration decides, which is the state every live payment has cleared
 * under so far. A value the mapping does not know is treated the same way,
 * loudly, because silently sending a misspelled state to a legacy endpoint is
 * indistinguishable from not sending one and would hide the typo forever.
 */
export function threeDSecureLowProfileFields(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const configured = source.CARDCOM_3DS_STATE?.trim().toLowerCase()
  if (!configured) return {}
  const mapped = THREE_DS_STATE_VALUES[configured]
  if (!mapped) {
    log.warn('cardcom.threeds_state_unknown', { configured })
    return {}
  }
  return { ThreeDSecureState: mapped }
}

/**
 * The decline codes the terminal uses for "this charge needs a 3DS challenge".
 *
 * The legacy interface's exact codes could not be verified from this machine,
 * so they are configuration rather than constants: `CARDCOM_3DS_REQUIRED_CODES`
 * is a comma-separated list, compared exactly. Empty by default, which fails in
 * the conservative direction - an unrecognized decline stays a decline and the
 * shopper is told so, instead of being bounced to a hosted page for a card
 * that was simply refused.
 */
function challengeRequiredCodes(source: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (source.CARDCOM_3DS_REQUIRED_CODES ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter((code) => code.length > 0),
  )
}

/**
 * "3DS", "3-D Secure", "ThreeDSecure" in either the code or the description.
 * A bare digit never matches, so numeric decline codes cannot trip this.
 */
const THREE_DS_TEXT = /(3[\s._-]?d[\s._-]?s(ecure)?)|(threed)/i

/**
 * Does this token-charge decline mean "run the challenge", rather than "no"?
 *
 * Two recognizers, either suffices: an exact match against the configured code
 * list, or 3DS language in the code or description. The text match exists
 * because the one thing Cardcom reliably localizes into its `Description` is
 * the name of the protocol, and it is the only signal available before the
 * code list has been confirmed against the live terminal.
 */
export function isThreeDSChallengeRequired(
  outcome: { failureCode: string | null; failureMessage: string | null },
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  const codes = challengeRequiredCodes(source)
  if (outcome.failureCode && codes.has(outcome.failureCode)) return true
  if (outcome.failureCode && THREE_DS_TEXT.test(outcome.failureCode)) return true
  if (outcome.failureMessage && THREE_DS_TEXT.test(outcome.failureMessage)) return true
  return false
}
