/**
 * Telegram, as a second phone channel next to ntfy.
 *
 * WHY A SECOND CHANNEL. ntfy is public: anyone who guesses the topic name reads
 * every alert, and anyone can post to it. That was accepted for a channel that
 * only ever carries identifiers, but it also means the channel cannot be
 * trusted to be the ONLY one when an uptime monitor starts feeding it. A
 * Telegram bot posts to one chat that only its token can write to and only
 * its members can read, which is the access control ntfy never had.
 *
 * WHAT THIS IS NOT. Not a replacement: `sendAlert` fans out to both, and a
 * message is delivered when EITHER accepts it. Two independent paths, so a
 * Telegram outage (or an unset token) never silences the ntfy page that has
 * worked since day one.
 *
 * Same shape as alert.ts, on purpose: one fetch, one timeout, never throws,
 * no `server-only` marker so a unit test can prove the path before an
 * incident does.
 */

export type TelegramConfig = {
  token: string
  chatId: string
}

/**
 * Both variables or nothing. Half a configuration is treated as absent rather
 * than as an error, the same contract Upstash and Axiom use in lib/env.ts: a
 * chat id with no token cannot send anything, and failing the boot over it
 * would turn an unfinished alert setup into an outage.
 */
/** `process.env` or any subset of it; tests pass a bare object. */
export type EnvLike = Record<string, string | undefined>

export function telegramConfig(env: EnvLike = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) return null
  return { token, chatId }
}

/** Telegram refuses anything over 4096 characters; this leaves room for the ellipsis. */
export const TELEGRAM_MAX_TEXT = 4000

export function truncateTelegramText(text: string): string {
  if (text.length <= TELEGRAM_MAX_TEXT) return text
  return `${text.slice(0, TELEGRAM_MAX_TEXT - 1)}…`
}

/**
 * The bot token is part of the URL Telegram is called on. It must never reach
 * a log line or a Sentry breadcrumb, so anything that reports this URL goes
 * through here first.
 */
export function redactTelegramUrl(url: string): string {
  return url.replace(/\/bot[^/]+/, '/bot[redacted]')
}

export type SendTelegramArgs = {
  text: string
  /** A quiet notification: the phone shows it but does not buzz. */
  silent?: boolean
  env?: EnvLike
  /** Override for tests. Never set in a deployment. */
  apiBase?: string
}

/**
 * Never throws and never rejects. Every caller is already on a failure branch.
 *
 * Plain text, no parse_mode. Markdown and HTML modes reject a message on any
 * unescaped character, and an alert body carries error text nobody escaped;
 * an alert refused for formatting is an alert that did not arrive.
 */
export async function sendTelegram(args: SendTelegramArgs): Promise<boolean> {
  const env = args.env ?? process.env
  if (env.ALERTS_ENABLED === 'false') return false
  const config = telegramConfig(env)
  if (!config) return false

  const base = (args.apiBase ?? env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(
    /\/$/,
    '',
  )

  try {
    const res = await fetch(`${base}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: truncateTelegramText(args.text),
        disable_web_page_preview: true,
        disable_notification: args.silent === true,
      }),
      // Same ceiling as ntfy in alert.ts, for the same reason: a hung alert
      // must not hold a Cardcom webhook open.
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}
