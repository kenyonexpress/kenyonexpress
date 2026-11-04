import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const begin = vi.hoisted(() => vi.fn())
const finish = vi.hoisted(() => vi.fn())
const startRegistration = vi.hoisted(() => vi.fn())

vi.mock('@/server/actions/passkeys', () => ({
  beginPasskeyRegistration: begin,
  finishPasskeyRegistration: finish,
}))
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration,
}))

import PasskeyAfterPurchase from './PasskeyAfterPurchase'

const USER = '00000000-0000-4000-8000-000000000019'

beforeEach(() => {
  localStorage.clear()
  begin.mockReset()
  finish.mockReset()
  startRegistration.mockReset()
})

afterEach(() => vi.restoreAllMocks())

describe('passkey registration after the first purchase', () => {
  it('offers registration to an account with no passkey', () => {
    render(<PasskeyAfterPurchase userId={USER} hasPasskeys={false} />)
    expect(screen.getByTestId('passkey-after-purchase')).toBeInTheDocument()
  })

  it('stays silent for an account that already has one', () => {
    render(<PasskeyAfterPurchase userId={USER} hasPasskeys />)
    expect(screen.queryByTestId('passkey-after-purchase')).toBeNull()
  })

  it('runs begin -> WebAuthn -> finish in place and confirms', async () => {
    begin.mockResolvedValue({ options: { challenge: 'c' } })
    startRegistration.mockResolvedValue({ id: 'cred' })
    finish.mockResolvedValue({ success: 'נשמר' })
    render(<PasskeyAfterPurchase userId={USER} hasPasskeys={false} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוספת מפתח כניסה' }))
    })
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'c' } })
    expect(finish).toHaveBeenCalledWith({ id: 'cred' })
    expect(screen.getByRole('status')).toHaveTextContent('נשמר')
  })

  it('treats a cancelled OS prompt as not now and snoozes', async () => {
    begin.mockResolvedValue({ options: {} })
    startRegistration.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    const { unmount } = render(<PasskeyAfterPurchase userId={USER} hasPasskeys={false} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוספת מפתח כניסה' }))
    })
    expect(screen.queryByTestId('passkey-after-purchase')).toBeNull()
    unmount()
    render(<PasskeyAfterPurchase userId={USER} hasPasskeys={false} />)
    expect(screen.queryByTestId('passkey-after-purchase')).toBeNull()
  })

  it('shows the server refusal instead of closing', async () => {
    begin.mockResolvedValue({ error: 'יש להתחבר' })
    render(<PasskeyAfterPurchase userId={USER} hasPasskeys={false} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'הוספת מפתח כניסה' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('יש להתחבר')
  })
})
