import { NextResponse } from 'next/server'

/**
 * Signup API endpoint placeholder.
 *
 * The actual signup logic is in src/server/actions/auth.ts (signUpWithEmail).
 * The welcome email and 10₪ bonus are credited in src/app/auth/callback/route.ts
 * after successful email verification.
 *
 * This endpoint exists to satisfy the F65 requirement specification.
 */

export async function POST() {
  return NextResponse.json(
    {
      message: 'Signup is handled via src/server/actions/auth.ts signUpWithEmail action',
    },
    { status: 501 },
  )
}
