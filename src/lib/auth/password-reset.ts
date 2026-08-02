// The single response a password-reset request may produce.
export const PASSWORD_RESET_MESSAGE = 'שלחנו לך קישור לאיפוס הסיסמה — בדקו את תיבת הדואר'

// Anti-enumeration: the reply must never depend on whether the address is
// registered, nor on any provider error, otherwise an attacker can probe which
// emails have accounts. Every outcome maps to the same success payload; real
// failures are logged server-side instead of being returned.
export function passwordResetResult(_providerError?: { message: string } | null): {
  success: string
} {
  return { success: PASSWORD_RESET_MESSAGE }
}
