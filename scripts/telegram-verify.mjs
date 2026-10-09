#!/usr/bin/env node
/**
 * Proves the Telegram alert channel end to end, the way sentry-verify.mjs
 * proves Sentry: by sending a real message and printing what the API said.
 *
 *   node scripts/telegram-verify.mjs          # send one test message
 *   node scripts/telegram-verify.mjs --dry    # config check only, no network
 *   node scripts/telegram-verify.mjs --chats  # list chat ids the bot has seen
 *
 * `--chats` is the setup helper: add the bot to the chat, send it any message,
 * run this, and the chat id to put in TELEGRAM_CHAT_ID is printed. The bot
 * token never reaches stdout.
 *
 * Exit 0 = Telegram accepted the message. Exit 1 = misconfigured or refused.
 */

import { readFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const CHATS = args.has('--chats')

function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync('.env.local', 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    out[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }
const token = env.TELEGRAM_BOT_TOKEN
const chatId = env.TELEGRAM_CHAT_ID
const base = (env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '')

function fail(message) {
  console.error(`telegram: ${String(message).replace(/\/bot[^/\s]+/g, '/bot[redacted]')}`)
  process.exit(1)
}

async function call(method, body) {
  const res = await fetch(`${base}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(10000),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) throw new Error(`${method} refused: ${json.description ?? `HTTP ${res.status}`}`)
  return json.result
}

async function main() {
  if (!token) fail('TELEGRAM_BOT_TOKEN is unset; sendAlert() will use ntfy alone')
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))
    fail('TELEGRAM_BOT_TOKEN is not shaped like a bot token')

  if (CHATS) {
    const updates = await call('getUpdates')
    const seen = new Map()
    for (const update of updates) {
      const chat = update.message?.chat ?? update.channel_post?.chat ?? update.my_chat_member?.chat
      if (chat) seen.set(chat.id, chat.title ?? chat.username ?? chat.first_name ?? chat.type)
    }
    if (seen.size === 0) {
      console.log('no chats seen yet: add the bot to the chat and send it a message, then re-run')
    }
    for (const [id, name] of seen) console.log(`${id}\t${name}`)
    return
  }

  if (!chatId) fail('TELEGRAM_CHAT_ID is unset; run with --chats to find it')
  if (DRY) {
    console.log(`telegram: configured for chat ${chatId}; dry run, nothing sent`)
    return
  }

  const me = await call('getMe')
  const sent = await call('sendMessage', {
    chat_id: chatId,
    text: `KenyonExpress alert channel check\nהודעת בדיקה מ-@${me.username}, ${new Date().toISOString()}`,
    disable_notification: true,
  })
  console.log(`telegram: delivered message ${sent.message_id} to chat ${chatId} as @${me.username}`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
