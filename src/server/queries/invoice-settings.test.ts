import { describe, expect, it } from 'vitest'
import { getInvoiceSettings } from './invoice-settings'

function fakeClient(result: { data: unknown; error: unknown }) {
  return {
    from() {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = () => chain
      chain.maybeSingle = async () => result
      return chain
    },
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
  } as any
}

describe('getInvoiceSettings', () => {
  it('reads the row when one exists', async () => {
    const settings = await getInvoiceSettings(
      fakeClient({
        data: {
          invoice_to_business: true,
          business_name: 'חברת דוגמה בע"מ',
          business_registration_number: '123456789',
        },
        error: null,
      }),
      'user-1',
    )
    expect(settings).toEqual({
      invoiceToBusiness: true,
      businessName: 'חברת דוגמה בע"מ',
      businessRegistrationNumber: '123456789',
    })
  })

  it('defaults to off when no row exists (never opted in)', async () => {
    const settings = await getInvoiceSettings(fakeClient({ data: null, error: null }), 'user-1')
    expect(settings).toEqual({
      invoiceToBusiness: false,
      businessName: null,
      businessRegistrationNumber: null,
    })
  })

  it('degrades to off, not an error, when the table is not applied yet (239 pending)', async () => {
    const settings = await getInvoiceSettings(
      fakeClient({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
      'user-1',
    )
    expect(settings.invoiceToBusiness).toBe(false)
  })

  it('throws on a real failure that is not the missing table', async () => {
    await expect(
      getInvoiceSettings(fakeClient({ data: null, error: { code: '500', message: 'boom' } }), 'u'),
    ).rejects.toThrow('boom')
  })
})
