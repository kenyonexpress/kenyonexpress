import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TELEGRAM_MAX_TEXT,
  redactTelegramUrl,
  sendTelegram,
  telegramConfig,
  truncateTelegramText,
} from './telegram'

describe('telegramConfig', () => {
  it('is null unless both the token and the chat id are set', () => {
    expect(telegramConfig({})).toBeNull()
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: '123:abc' })).toBeNull()
    expect(telegramConfig({ TELEGRAM_CHAT_ID: '42' })).toBeNull()
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: ' ', TELEGRAM_CHAT_ID: '42' })).toBeNull()
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '42' })).toEqual({
      token: '123:abc',
      chatId: '42',
    })
  })
})

describe('sendTelegram', () => {
  const originalFetch = globalThis.fetch
  const env = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '-100777' }

  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('posts plain text to the bot sendMessage endpoint for the configured chat', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('{"ok":true}', { status: 200 })
    }) as never

    const ok = await sendTelegram({ text: 'שלום', env })

    expect(ok).toBe(true)
    expect(calls[0]?.url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(calls[0]?.init.method).toBe('POST')
    const body = JSON.parse(String(calls[0]?.init.body))
    expect(body).toMatchObject({ chat_id: '-100777', text: 'שלום', disable_notification: false })
    // No parse_mode: an alert body carries unescaped error text, and a message
    // refused for formatting is a message that never arrived.
    expect(body.parse_mode).toBeUndefined()
  })

  it('makes no request at all when the bot is not configured', async () => {
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response('ok')
    }) as never

    expect(await sendTelegram({ text: 'x', env: {} })).toBe(false)
    expect(called).toBe(false)
  })

  it('honours the global kill switch', async () => {
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response('ok')
    }) as never

    expect(await sendTelegram({ text: 'x', env: { ...env, ALERTS_ENABLED: 'false' } })).toBe(false)
    expect(called).toBe(false)
  })

  it('never throws when Telegram is unreachable or refuses', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as never
    await expect(sendTelegram({ text: 'x', env })).resolves.toBe(false)

    globalThis.fetch = (async () => new Response('{"ok":false}', { status: 400 })) as never
    await expect(sendTelegram({ text: 'x', env })).resolves.toBe(false)
  })

  it('marks a silent alert so the phone does not buzz', async () => {
    let body = ''
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = String(init.body)
      return new Response('ok')
    }) as never

    await sendTelegram({ text: 'x', env, silent: true })
    expect(JSON.parse(body).disable_notification).toBe(true)
  })

  it('accepts a test API base and strips a trailing slash', async () => {
    let url = ''
    globalThis.fetch = (async (u: string) => {
      url = u
      return new Response('ok')
    }) as never

    await sendTelegram({ text: 'x', env, apiBase: 'http://127.0.0.1:9/' })
    expect(url).toBe('http://127.0.0.1:9/bot123:abc/sendMessage')
  })
})

describe('text limits and redaction', () => {
  it('truncates to the Telegram ceiling rather than being refused', () => {
    const long = 'א'.repeat(TELEGRAM_MAX_TEXT + 500)
    const out = truncateTelegramText(long)
    expect(out.length).toBe(TELEGRAM_MAX_TEXT)
    expect(out.endsWith('…')).toBe(true)
    expect(truncateTelegramText('short')).toBe('short')
  })

  it('redacts the bot token out of a URL before it can be logged', () => {
    expect(redactTelegramUrl('https://api.telegram.org/bot123:abc-DEF/sendMessage')).toBe(
      'https://api.telegram.org/bot[redacted]/sendMessage',
    )
  })
})
