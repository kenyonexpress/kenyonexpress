import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'

/**
 * WhatsApp sign-in codes through the Meta WhatsApp Cloud API, directly
 * (rc5 F15). A code must go out as an approved AUTHENTICATION template; the
 * template name is META_WA_OTP_TEMPLATE (default `otp_code`, language he).
 *
 * Inert without META_WABA_TOKEN and META_WABA_PHONE_ID: the caller gets a
 * skipped result. Only a template Meta refuses (`templateRejected`) sends the
 * caller to the email fallback.
 */
const GRAPH = 'https://graph.facebook.com/v21.0'

export function isMetaWhatsappConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.META_WABA_TOKEN && env.META_WABA_PHONE_ID)
}

export type MetaSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string; templateRejected?: boolean }

/**
 * Meta's template errors: 132000-132099 (missing, unapproved, paused,
 * disabled, parameter mismatch) and 131058 (hsm/template not allowed).
 */
export function isTemplateRejection(code: number | undefined): boolean {
  return code !== undefined && ((code >= 132000 && code <= 132099) || code === 131058)
}

export async function sendWhatsappOtp(
  phoneE164: string,
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MetaSendResult> {
  if (!isMetaWhatsappConfigured(env)) {
    return { ok: false, skipped: true, reason: 'META_WABA_* not configured' }
  }
  const template = env.META_WA_OTP_TEMPLATE ?? 'otp_code'
  const res = await fetchWithTimeout(`${GRAPH}/${env.META_WABA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.META_WABA_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneE164.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template,
        language: { code: env.META_WA_OTP_LANGUAGE ?? 'he' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    }),
  }).catch((err: unknown) => err as Error)
  if (res instanceof Error) return { ok: false, reason: res.message }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { code?: number } } | null
    const rejected = isTemplateRejection(err?.error?.code)
    return {
      ok: false,
      reason: rejected ? `meta_template_${err?.error?.code}` : `meta_${res.status}`,
      ...(rejected ? { templateRejected: true } : {}),
    }
  }
  const json = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null
  return { ok: true, messageId: json?.messages?.[0]?.id ?? null }
}
