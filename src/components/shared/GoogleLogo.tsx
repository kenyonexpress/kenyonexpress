/**
 * Google's "G" mark, for the OAuth sign-in buttons.
 *
 * The four fills are Google's trademarked brand colours, reproduced exactly as
 * the Google Identity branding guidelines require. They are deliberately NOT
 * design tokens: a rebrand of KenyonExpress must not touch them, and no other
 * component may reference them. This file is the single place they appear, and
 * is the one allowlisted exception in the "no raw hex in .tsx" rule enforced by
 * src/styles/tokens.test.ts.
 */
export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2a10 10 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18a8.59 8.59 0 0 0 5.96-2.18l-2.92-2.26a5.43 5.43 0 0 1-8.07-2.85H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58a4.86 4.86 0 0 1 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96L3.97 7.3A5.43 5.43 0 0 1 9 3.58z"
      />
    </svg>
  )
}
