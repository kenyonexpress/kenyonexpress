import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { deleteAccountData } from '@/server/account/data-rights'
import { NextResponse } from 'next/server'

async function handlePOST(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'יש להתחבר' }, { status: 401 })
  }

  const result = await deleteAccountData(user.id)
  if (!result.ok) {
    return NextResponse.json({ error: 'מחיקת החשבון נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/account/data-delete', handlePOST)
