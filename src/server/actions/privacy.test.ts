import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const runAnonymizationCascade = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/account/deletion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/deletion')>()),
  runAnonymizationCascade,
}))
vi.mock('next/navigation', () => ({ redirect }))

import { DELETE_CONFIRM_WORD } from '@/lib/account/deletion-confirm'
import { deleteMyAccount } from './privacy'

const USER_ID = '00000000-0000-4000-8000-000000000042'

function form(confirm?: string): FormData {
  const data = new FormData()
  if (confirm !== undefined) data.set('confirm', confirm)
  return data
}

describe('deleteMyAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    signOut.mockResolvedValue({ error: null })
    createClient.mockResolvedValue({ auth: { getUser, signOut } })
    createAdminClient.mockReturnValue({ tag: 'admin-client' })
    checkRateLimit.mockResolvedValue(true)
    runAnonymizationCascade.mockResolvedValue({ failed: [], criticalFailed: [] })
  })

  it('refuses without a session, before any write', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const result = await deleteMyAccount(null, form(DELETE_CONFIRM_WORD))
    expect(result).toEqual({ error: 'יש להתחבר' })
    expect(runAnonymizationCascade).not.toHaveBeenCalled()
  })

  it('refuses without the exact typed confirmation word', async () => {
    for (const wrong of [undefined, '', 'מחק', 'delete', ` ${DELETE_CONFIRM_WORD}`]) {
      const result = await deleteMyAccount(null, form(wrong))
      expect(result && 'error' in result).toBe(true)
    }
    expect(runAnonymizationCascade).not.toHaveBeenCalled()
  })

  it('refuses when rate limited', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await deleteMyAccount(null, form(DELETE_CONFIRM_WORD))
    expect(result && 'error' in result).toBe(true)
    expect(runAnonymizationCascade).not.toHaveBeenCalled()
  })

  it('keys the cascade and the rate limit on the session, not on the form', async () => {
    await deleteMyAccount(null, form(DELETE_CONFIRM_WORD))
    expect(checkRateLimit).toHaveBeenCalledWith(`account-delete:${USER_ID}`, 3, 3600)
    expect(runAnonymizationCascade).toHaveBeenCalledWith({ tag: 'admin-client' }, USER_ID)
  })

  it('does not claim success or end the session when the PII survived', async () => {
    runAnonymizationCascade.mockResolvedValue({ failed: [], criticalFailed: ['profiles'] })
    const result = await deleteMyAccount(null, form(DELETE_CONFIRM_WORD))
    expect(result && 'error' in result).toBe(true)
    expect(signOut).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('signs out everywhere and leaves for the homepage on success', async () => {
    await deleteMyAccount(null, form(DELETE_CONFIRM_WORD))
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})
