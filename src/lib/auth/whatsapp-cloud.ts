/**
 * WhatsApp sign-in codes through Meta's Cloud API (S19).
 *
 * WHICH CHANNEL IS DECIDED BY THE ENVIRONMENT, ONCE, ON THE SERVER. With all
 * three of `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID` and
 * `WHATSAPP_OTP_SECRET` present, the code form asks for a phone and sends the
 * code as a WhatsApp authentication template. With any one missing it asks for
 * an email and the code goes by mail instead. A half-configured deployment
 * therefore never shows a WhatsApp button that cannot send.
 *
 * This is a separate sender from `server/whatsapp/twilio.ts` on purpose:
 * that one carries order notices through a Twilio-hosted number, and an
 * authentication template has to be approved on the Meta WABA that owns the
 * phone number id here. Different sender, different approval, different bill.
 */

export type WhatsAppCloudConfig = {
  token: string
  phoneNumberId: string
  secret: string
  template: string
  language: string
  apiVersion: string
}

export type OtpChannel = 'whatsapp' | 'email'

const MIN_SECRET_LENGTH = 32

export function whatsappCloudConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppCloudConfig | null {
  const token = env.WHATSAPP_CLOUD_TOKEN?.trim()
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim()
  const secret = env.WHATSAPP_OTP_SECRET?.trim()
  // A short secret is a missing secret: the HMAC is the only thing standing
  // between a forged cookie and somebody else's account.
  if (!token || !phoneNumberId || !secret || secret.length < MIN_SECRET_LENGTH) return null
  // The harness and some CI shells inject "[SENSITIVE]" placeholders; a value
  // in brackets is never a real Graph token or numeric phone id.
  if (/^\[.*\]$/.test(token) || !/^\d+$/.test(phoneNumberId)) return null
  return {
    token,
    phoneNumberId,
    secret,
    template: env.WHATSAPP_OTP_TEMPLATE?.trim() || 'login_code',
    language: env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || 'he',
    apiVersion: env.WHATSAPP_CLOUD_API_VERSION?.trim() || 'v21.0',
  }
}

export function otpChannel(env: NodeJS.ProcessEnv = process.env): OtpChannel {
  return whatsappCloudConfig(env) ? 'whatsapp' : 'email'
}

/**
 * The body Meta expects for an AUTHENTICATION template with a copy-code
 * button: the code goes in the body parameter AND in the button's url
 * parameter. Leaving out the button component is the common mistake, and Meta
 * answers it with error 131008 rather than sending a message without one.
 */
export function buildOtpTemplatePayload(input: {
  e164: string
  code: string
  template: string
  language: string
}) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    // Cloud API wants the number without the plus.
    to: input.e164.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.language },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: input.code }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: input.code }],
        },
      ],
    },
  }
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; reason: string }

export async function sendWhatsAppOtp(
  config: WhatsAppCloudConfig,
  e164: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        buildOtpTemplatePayload({
          e164,
          code,
          template: config.template,
          language: config.language,
        }),
      ),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    const body = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[]
      error?: { code?: number; message?: string }
    } | null
    if (!response.ok) {
      // The Graph error code only, never the message: it can quote the token's
      // app or the WABA, which is operational detail and not the customer's.
      return { ok: false, reason: `graph_${response.status}_${body?.error?.code ?? 'unknown'}` }
    }
    return { ok: true, messageId: body?.messages?.[0]?.id ?? null }
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.name : 'unknown' }
  }
}
