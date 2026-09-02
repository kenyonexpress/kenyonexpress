import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { exportAccountData } from '@/server/account/data-rights'
import { NextResponse } from 'next/server'

async function handleGET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'יש להתחבר' }, { status: 401 })
  }

  try {
    const payload = await exportAccountData(user.id)
    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': 'attachment; filename="kenyonexpress-data.json"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'ייצוא המידע נכשל' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/account/data-export', handleGET)
