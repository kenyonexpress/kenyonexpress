/**
 * Israeli bank details, and the one thing that must never happen to them.
 *
 * THE ACCOUNT NUMBER IS NEVER STORED IN A COLUMN. It goes into
 * `vault.create_secret` and the application row keeps only the returned uuid,
 * so a leaked row, a stray `select *`, a CSV export or a Postgres log line
 * carries an opaque id and not somebody's bank account. What IS kept in the
 * clear is the bank code, the branch and the last four digits, because a payout
 * operator needs to recognise an account without reading it and those three
 * cannot be used to move money.
 *
 * WHAT THE VALIDATION CAN AND CANNOT DO. Israeli account numbers have no
 * national check digit: each bank sets its own length and its own internal
 * rules, and several publish none. So this checks SHAPE - a known bank code, a
 * branch of three digits, an account of the length that bank actually uses -
 * and it is honest that a well-formed account can still belong to nobody. The
 * thing that catches that is the bank confirmation document (אישור ניהול חשבון)
 * the applicant uploads, which is why the onboarding flow requires one and does
 * not treat a green tick here as verification.
 */

export type Bank = { code: string; name: string; accountDigits: readonly number[] }

/**
 * The banks that can actually receive a payout here, by Bank of Israel code.
 *
 * NOT EVERY BANK IN THE COUNTRY, and the omissions are deliberate: this list is
 * the retail banks a supplier in Israel holds a business account with. A bank
 * that is missing produces a named refusal the operator can act on ("we do not
 * have this bank on file") rather than a silent acceptance of a code nothing
 * will ever pay into.
 *
 * `accountDigits` is the set of lengths that bank issues. Where a bank uses a
 * range, every length in it is listed, because a shorter number is usually a
 * customer omitting leading zeros and that is worth catching.
 */
export const BANKS: readonly Bank[] = [
  { code: '10', name: 'בנק לאומי', accountDigits: [6, 7, 8] },
  { code: '11', name: 'בנק דיסקונט', accountDigits: [6, 7, 8, 9] },
  { code: '12', name: 'בנק הפועלים', accountDigits: [6, 7, 8, 9] },
  { code: '13', name: 'בנק אגוד', accountDigits: [6, 7, 8, 9] },
  { code: '14', name: 'בנק אוצר החייל', accountDigits: [6, 7, 8, 9] },
  { code: '17', name: 'בנק מרכנתיל דיסקונט', accountDigits: [6, 7, 8, 9] },
  { code: '20', name: 'בנק מזרחי טפחות', accountDigits: [6, 7, 8, 9] },
  { code: '31', name: 'בנק הבינלאומי הראשון', accountDigits: [6, 7, 8, 9] },
  { code: '46', name: 'בנק מסד', accountDigits: [6, 7, 8, 9] },
  { code: '52', name: 'בנק פועלי אגודת ישראל', accountDigits: [6, 7, 8, 9] },
  { code: '54', name: 'בנק ירושלים', accountDigits: [6, 7, 8, 9] },
  { code: '09', name: 'בנק הדואר', accountDigits: [6, 7, 8, 9] },
  { code: '04', name: 'בנק יהב', accountDigits: [6, 7, 8, 9] },
  { code: '68', name: 'בנק One Zero', accountDigits: [6, 7, 8, 9] },
]

export function bankByCode(code: string): Bank | undefined {
  const padded = code.trim().padStart(2, '0')
  return BANKS.find((bank) => bank.code === padded)
}

export type BankDetailsInput = {
  bankCode: string
  branch: string
  accountNumber: string
  /** The name the account is held in, checked against the business name by a human. */
  accountHolder: string
}

export type BankDetailsCheck =
  | {
      ok: true
      bankCode: string
      bankName: string
      branch: string
      accountNumber: string
      /** Safe to store in the clear and to show an operator. */
      last4: string
      accountHolder: string
    }
  | { ok: false; field: 'bankCode' | 'branch' | 'accountNumber' | 'accountHolder'; message: string }

const DIGITS = /^\d+$/

export function checkBankDetails(input: BankDetailsInput): BankDetailsCheck {
  const bank = bankByCode(input.bankCode)
  if (!bank) {
    return {
      ok: false,
      field: 'bankCode',
      message: 'הבנק אינו ברשימה. פנו אלינו ונוסיף אותו.',
    }
  }

  const branch = input.branch.trim().replace(/\D/g, '')
  if (branch.length === 0 || branch.length > 3 || !DIGITS.test(branch)) {
    return { ok: false, field: 'branch', message: 'מספר סניף הוא עד שלוש ספרות' }
  }

  const accountNumber = input.accountNumber.trim().replace(/[\s-]/g, '')
  if (!DIGITS.test(accountNumber)) {
    return { ok: false, field: 'accountNumber', message: 'מספר חשבון מכיל ספרות בלבד' }
  }
  if (!bank.accountDigits.includes(accountNumber.length)) {
    const lengths = bank.accountDigits.join(' / ')
    return {
      ok: false,
      field: 'accountNumber',
      // Names the expected length rather than saying "invalid": the usual
      // cause is omitted leading zeros, and the number tells them that.
      message: `מספר חשבון ב${bank.name} הוא ${lengths} ספרות. השלימו אפסים מובילים אם צריך.`,
    }
  }

  const accountHolder = input.accountHolder.trim()
  if (accountHolder.length < 2) {
    return { ok: false, field: 'accountHolder', message: 'נא למלא את שם בעל החשבון' }
  }

  return {
    ok: true,
    bankCode: bank.code,
    bankName: bank.name,
    // Padded on the way out, so `12` and `012` are one branch and not two.
    branch: branch.padStart(3, '0'),
    accountNumber,
    last4: accountNumber.slice(-4),
    accountHolder,
  }
}

/**
 * The string that goes into the vault. One line, not JSON: the vault holds a
 * `text` secret, and a shape somebody has to parse invites a reader that
 * accepts a half-decrypted value.
 */
export function bankSecretPayload(details: Extract<BankDetailsCheck, { ok: true }>): string {
  return [details.bankCode, details.branch, details.accountNumber, details.accountHolder].join('|')
}

/** Never rendered anywhere near the full number. */
export function maskedAccount(bankName: string, branch: string, last4: string): string {
  return `${bankName}, סניף ${branch}, חשבון ****${last4}`
}
