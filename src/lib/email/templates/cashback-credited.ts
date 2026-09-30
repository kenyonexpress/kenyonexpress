/**
 * The ledger's name for `./cashback-earned.ts`. One template, two spellings:
 * `cashback_credited` is the outbox kind and the wallet reason, "earned" is
 * what the customer reads. Kept as a re-export so an older import keeps
 * compiling and no second copy of the mail appears.
 */
export {
  buildCashbackEarnedEmail as buildCashbackCreditedEmail,
  type CashbackEarnedInput as CashbackCreditedInput,
} from './cashback-earned'
