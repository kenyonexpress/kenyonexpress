import { handleStripeWebhookRequest } from '@/server/payments/stripe-webhook-handler'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  return handleStripeWebhookRequest(rawBody, request.headers)
}
