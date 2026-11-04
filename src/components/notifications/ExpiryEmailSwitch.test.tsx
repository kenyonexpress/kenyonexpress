import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/server/actions/notifications', () => ({ saveNotificationPreference: save }))

import ExpiryEmailSwitch from './ExpiryEmailSwitch'

describe('ExpiryEmailSwitch (S20)', () => {
  beforeEach(() => save.mockReset())

  it('is off with no stored row: the sweep never mails on its own', () => {
    render(<ExpiryEmailSwitch rows={[]} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('reflects a stored opt-in', () => {
    render(
      <ExpiryEmailSwitch rows={[{ kind: 'voucher_expiring', channel: 'email', enabled: true }]} />,
    )
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('writes voucher_expiring/email and reverts on a refused save', async () => {
    save.mockResolvedValue({ ok: false, error: 'יש להתחבר.' })
    render(<ExpiryEmailSwitch rows={[]} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox'))
    })
    expect(save).toHaveBeenCalledWith('voucher_expiring', 'email', true)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('alert').textContent).toBe('יש להתחבר.')
  })
})
