import { describe, expect, it, vi } from 'vitest'
import { notify, sendNtfy, sendTelegram, telegramConfig, truncate } from './notify.mjs'

const okFetch = () => vi.fn(async () => ({ ok: true, status: 200 }))
const failFetch = () => vi.fn(async () => ({ ok: false, status: 500 }))

describe('telegramConfig', () => {
  it('needs both variables', () => {
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: 't' })).toBeNull()
    expect(telegramConfig({ TELEGRAM_CHAT_ID: 'c' })).toBeNull()
    expect(telegramConfig({ TELEGRAM_BOT_TOKEN: ' t ', TELEGRAM_CHAT_ID: ' c ' })).toEqual({
      token: 't',
      chatId: 'c',
    })
  })
})

describe('sendTelegram', () => {
  const env = {
    TELEGRAM_BOT_TOKEN: '123:abc',
    TELEGRAM_CHAT_ID: '-100',
    TELEGRAM_API_BASE: 'https://tg.test/',
  }

  it('posts plain text with the chat id and no parse_mode', async () => {
    const fetchImpl = okFetch()
    expect(await sendTelegram({ text: 'hello', env, fetchImpl })).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://tg.test/bot123:abc/sendMessage')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ chat_id: '-100', text: 'hello', disable_notification: false })
    expect(body.parse_mode).toBeUndefined()
  })

  it('is silent for a default-priority message', async () => {
    const fetchImpl = okFetch()
    await sendTelegram({ text: 'x', silent: true, env, fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).disable_notification).toBe(true)
  })

  it('returns false without config, when disabled, on refusal, and on a thrown fetch', async () => {
    expect(await sendTelegram({ text: 'x', env: {}, fetchImpl: okFetch() })).toBe(false)
    expect(
      await sendTelegram({
        text: 'x',
        env: { ...env, ALERTS_ENABLED: 'false' },
        fetchImpl: okFetch(),
      }),
    ).toBe(false)
    expect(await sendTelegram({ text: 'x', env, fetchImpl: failFetch() })).toBe(false)
    const thrower = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    await expect(sendTelegram({ text: 'x', env, fetchImpl: thrower })).resolves.toBe(false)
  })

  it('truncates to the Telegram ceiling', () => {
    expect(truncate('a'.repeat(5000)).length).toBe(4000)
    expect(truncate('short')).toBe('short')
  })
})

describe('sendNtfy', () => {
  it('posts to the configured topic with ASCII headers', async () => {
    const fetchImpl = okFetch()
    const env = { NTFY_TOPIC: 'kenyon-test', NTFY_BASE_URL: 'https://ntfy.test' }
    expect(
      await sendNtfy({ title: 'KE deploy: x', text: 'גוף', priority: 'urgent', env, fetchImpl }),
    ).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://ntfy.test/kenyon-test')
    expect(init.headers).toMatchObject({ Title: 'KE deploy: x', Priority: 'urgent' })
    expect(init.body).toBe('גוף')
  })

  it('falls back to the standing topic', async () => {
    const fetchImpl = okFetch()
    await sendNtfy({ title: 't', text: 'x', env: {}, fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://ntfy.sh/kenyon-ofir-limit')
  })
})

describe('notify', () => {
  it('delivers when either channel accepts, and reports which', async () => {
    const env = { TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_CHAT_ID: '2' }
    const fetchImpl = vi.fn(async (url) => ({ ok: String(url).includes('ntfy'), status: 200 }))
    const result = await notify({ title: 't', text: 'x', env, fetchImpl })
    expect(result).toMatchObject({ telegram: false, ntfy: true, delivered: true, configured: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not call Telegram at all without a token', async () => {
    const fetchImpl = okFetch()
    await notify({ title: 't', text: 'x', env: {}, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toContain('ntfy.sh')
  })

  it('prefixes the Telegram text with the title', async () => {
    const env = { TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_CHAT_ID: '2' }
    const fetchImpl = okFetch()
    await notify({ title: 'KE deploy: rolled back', text: 'body', env, fetchImpl })
    const telegramCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('/bot'))
    expect(JSON.parse(telegramCall[1].body).text).toBe('KE deploy: rolled back\nbody')
  })
})
