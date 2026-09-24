/**
 * Deploy-side incident notification: Telegram first, ntfy as the second leg.
 *
 * Mirrors src/lib/observability/{telegram,alert}.ts, which run inside the app.
 * This copy exists because a GitHub Actions runner has no Next.js runtime and
 * no `@/` alias, and an alert about a broken deployment cannot depend on the
 * deployment being able to build. Same contract as the app modules: never
 * throws, one fetch per channel, four-second ceiling, the bot token never
 * reaches stdout.
 *
 *   node scripts/deploy/notify.mjs --title "KE deploy: x" --text "..." [--priority high]
 *
 * Exit 0 when at least one channel accepted the message, 1 when neither did,
 * 2 when nothing is configured (so a workflow can tell "unconfigured" from
 * "down" without parsing text).
 */

import { redactSecrets } from './lib.mjs'

export const TELEGRAM_MAX_TEXT = 4000

export function telegramConfig(env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = env.TELEGRAM_CHAT_ID?.trim()
  if (!token || !chatId) return null
  return { token, chatId }
}

export function truncate(text) {
  if (text.length <= TELEGRAM_MAX_TEXT) return text
  return `${text.slice(0, TELEGRAM_MAX_TEXT - 1)}…`
}

/** `true` when Telegram accepted the message. Never throws. */
export async function sendTelegram({ text, silent = false, env = process.env, fetchImpl = fetch }) {
  if (env.ALERTS_ENABLED === 'false') return false
  const config = telegramConfig(env)
  if (!config) return false
  const base = (env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '')
  try {
    const res = await fetchImpl(`${base}/bot${config.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: truncate(text),
        disable_web_page_preview: true,
        disable_notification: silent,
      }),
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}

/** `true` when ntfy accepted the message. Never throws. */
export async function sendNtfy({
  title,
  text,
  priority = 'high',
  tags = ['warning'],
  env = process.env,
  fetchImpl = fetch,
}) {
  if (env.ALERTS_ENABLED === 'false') return false
  const topic = env.NTFY_TOPIC ?? 'kenyon-ofir-limit'
  const base = (env.NTFY_BASE_URL ?? 'https://ntfy.sh').replace(/\/$/, '')
  try {
    const res = await fetchImpl(`${base}/${topic}`, {
      method: 'POST',
      // ntfy reads headers as ASCII: the title is English, the body carries the Hebrew.
      headers: { Title: title, Priority: priority, Tags: tags.join(',') },
      body: text,
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Both channels, concurrently and independently. Returns which accepted, so a
 * caller can log "telegram: no, ntfy: yes" instead of a bare boolean.
 */
export async function notify({
  title,
  text,
  priority = 'high',
  env = process.env,
  fetchImpl = fetch,
}) {
  const configured = Boolean(telegramConfig(env)) || env.NTFY_TOPIC !== undefined
  const [telegram, ntfy] = await Promise.all([
    sendTelegram({ text: `${title}\n${text}`, silent: priority === 'default', env, fetchImpl }),
    sendNtfy({
      title,
      text,
      priority,
      tags: priority === 'urgent' ? ['rotating_light'] : ['warning'],
      env,
      fetchImpl,
    }),
  ])
  return { telegram, ntfy, delivered: telegram || ntfy, configured }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    out[key] = inline ?? (argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true'))
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.title || !args.text) {
    console.error('usage: notify.mjs --title "..." --text "..." [--priority default|high|urgent]')
    return 2
  }
  const result = await notify({
    title: args.title,
    text: args.text,
    priority: args.priority ?? 'high',
  })
  console.log(
    redactSecrets(
      `notify: telegram=${result.telegram ? 'accepted' : 'no'} ntfy=${result.ntfy ? 'accepted' : 'no'}`,
    ),
  )
  if (result.delivered) return 0
  return telegramConfig(process.env) ? 1 : 2
}

if (process.argv[1]?.endsWith('notify.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
