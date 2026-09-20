/**
 * E2E tests for SECTION 40: Data Export and Deletion (GDPR + Israeli Privacy Law)
 */

import { expect, test } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

test.describe('Data Export (GDPR Article 15)', () => {
  test('User can export account data via API', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/account/export`)
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('generated_at')
    expect(data).toHaveProperty('user_id')
    expect(data).toHaveProperty('sections')
    expect(data).toHaveProperty('notes')
  })

  test('Export rate limits to 1 per day per user', async ({ request }) => {
    const response1 = await request.post(`${BASE_URL}/api/account/export`)
    expect(response1.status()).toBe(200)

    const response2 = await request.post(`${BASE_URL}/api/account/export`)
    expect(response2.status()).toBe(429)
  })

  test('Unauthenticated users cannot export', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/account/export`)
    expect(response.status()).toBe(401)
  })
})

test.describe('Account Deletion (GDPR Article 17)', () => {
  test('User can request account deletion', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/account/delete`, {
      data: { reason: 'No longer needed' },
    })

    expect(response.status()).toBe(201)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data).toHaveProperty('deletion_id')
    expect(data.status).toBe('requested')
  })

  test('Grace period is exactly 30 days', async ({ request }) => {
    const now = new Date()
    const response = await request.post(`${BASE_URL}/api/account/delete`)

    const data = await response.json()
    const graceExpires = new Date(data.grace_period_expires_at)
    const diffDays = Math.round((graceExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
  })

  test('Unauthenticated users cannot delete', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/account/delete`)
    expect(response.status()).toBe(401)
  })
})

test.describe('Compliance Verification', () => {
  test('Export filename is ASCII-only', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/account/export`)
    const disposition = response.headers()['content-disposition']
    const filenameMatch = disposition?.match(/filename="([^"]+)"/)
    expect(filenameMatch).toBeTruthy()

    const filename = filenameMatch?.[1] || ''
    // Printable ASCII rather than \x00-\x7F: the header is unusable with a
    // control character in it just as surely as with a Hebrew one, and a class
    // that spells the control range out is itself the lint error.
    expect(/^[\u0020-\u007E]+$/.test(filename)).toBe(true)
  })
})
