/**
 * Basis points → a percent string through integer arithmetic: 1250 → "12.5%",
 * 1000 → "10%", 1233 → "12.33%". No float division on the way; the account
 * page and the admin console print the same string for the same row.
 */
export function commissionPercent(commissionBp: number): string {
  const whole = Math.floor(commissionBp / 100)
  const rest = commissionBp % 100
  if (rest === 0) return `${whole}%`
  return `${whole}.${String(rest).padStart(2, '0').replace(/0$/, '')}%`
}
