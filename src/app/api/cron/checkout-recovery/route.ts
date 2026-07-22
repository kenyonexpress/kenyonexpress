import { runCheckoutRecoveryJob } from '@/server/jobs/checkout-recovery'

export const runtime = 'nodejs'

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const header = request.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function POST(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const summary = await runCheckoutRecoveryJob()
    return Response.json({ ok: true, ...summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'recovery failed'
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request)
}
