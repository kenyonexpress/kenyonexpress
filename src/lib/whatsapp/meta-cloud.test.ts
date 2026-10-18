import { describe, expect, it } from 'vitest'
import { isMetaWhatsappConfigured, sendWhatsappOtp } from './meta-cloud'

describe('Meta WhatsApp Cloud API sender', () => {
  it('is skipped, not failed, without credentials', async () => {
    const env = {} as NodeJS.ProcessEnv
    expect(isMetaWhatsappConfigured(env)).toBe(false)
    await expect(sendWhatsappOtp('+972501234567', '123456', env)).resolves.toEqual({
      ok: false,
      skipped: true,
      reason: 'META_WABA_* not configured',
    })
  })
})
