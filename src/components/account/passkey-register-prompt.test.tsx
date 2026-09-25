import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/passkeys', () => ({
  beginPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import PasskeyRegisterPrompt from './PasskeyRegisterPrompt'

/**
 * "Not now" on the passkey dialog is thirty days, not forever (Q17). The
 * registration ceremony itself is covered by the e2e spec and the server
 * action tests; this pins the gate around it.
 */

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 25, 12, 0, 0)
const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function dialog() {
  return screen.queryByRole('dialog', { name: 'כניסה מהירה בלי סיסמה' })
}

describe('the passkey registration prompt', () => {
  it('asks a customer with no passkeys', () => {
    render(<PasskeyRegisterPrompt userId={USER} hasPasskeys={false} />)
    expect(dialog()).toBeInTheDocument()
  })

  it('never asks a customer who already has one', () => {
    render(<PasskeyRegisterPrompt userId={USER} hasPasskeys />)
    expect(dialog()).not.toBeInTheDocument()
  })

  it('"not now" is thirty days on this device, keyed by user', () => {
    const first = render(<PasskeyRegisterPrompt userId={USER} hasPasskeys={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'לא עכשיו' }))
    expect(dialog()).not.toBeInTheDocument()
    expect(localStorage.getItem(`ke_passkey_prompt_seen:${USER}`)).toBe(String(T0 + 30 * DAY))
    first.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(T0 + 29 * DAY)
    const second = render(<PasskeyRegisterPrompt userId={USER} hasPasskeys={false} />)
    expect(dialog()).not.toBeInTheDocument()
    second.unmount()

    // A different user on the same device is a different question.
    const other = render(<PasskeyRegisterPrompt userId="other-user" hasPasskeys={false} />)
    expect(dialog()).toBeInTheDocument()
    other.unmount()

    vi.spyOn(Date, 'now').mockReturnValue(T0 + 30 * DAY)
    render(<PasskeyRegisterPrompt userId={USER} hasPasskeys={false} />)
    expect(dialog()).toBeInTheDocument()
  })

  it('the legacy permanent flag asks once more, then falls under the thirty-day rule', () => {
    localStorage.setItem(`ke_passkey_prompt_seen:${USER}`, '1')
    render(<PasskeyRegisterPrompt userId={USER} hasPasskeys={false} />)
    expect(dialog()).toBeInTheDocument()
  })
})
