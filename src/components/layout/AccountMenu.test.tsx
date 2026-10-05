import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountMenu from './AccountMenu'

/**
 * The account panel asks for the club tier once, on first open, and shows it
 * in place of the sign-in prompt when there is one.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function answer(body: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, json: async () => body })
}

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'החשבון שלי' }))
  await act(async () => {
    await Promise.resolve()
  })
}

describe('AccountMenu and the club tier', () => {
  it('fetches nothing while closed', () => {
    answer({ tier: null })
    render(<AccountMenu />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows sign in and register for a visitor, and asks the route only once', async () => {
    answer({ tier: null })
    render(<AccountMenu />)
    await open()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/account/club')
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'הרשמה' })).toHaveAttribute('href', '/signup')
    expect(screen.queryByTestId('account-menu-club')).toBeNull()
    // Close and reopen: no second request.
    fireEvent.click(screen.getByRole('button', { name: 'החשבון שלי' }))
    await open()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the tier badge and a link to the account for a member', async () => {
    answer({ tier: 'gold', nextTier: 'platinum', progressPercent: 40 })
    render(<AccountMenu />)
    await open()
    const block = await screen.findByTestId('account-menu-club')
    expect(block).toHaveAttribute('data-tier', 'gold')
    expect(block.querySelector('.club-badge')?.textContent).toBe('זהב')
    expect(block.textContent).toContain('הדרגה שלך במועדון: זהב')
    expect(screen.getByRole('link', { name: 'לאזור האישי' })).toHaveAttribute('href', '/account')
    expect(screen.queryByRole('link', { name: 'התחברות' })).toBeNull()
  })

  it('ignores a tier id it does not know and a failed response', async () => {
    answer({ tier: 'diamond' })
    const first = render(<AccountMenu />)
    await open()
    expect(screen.queryByTestId('account-menu-club')).toBeNull()
    expect(screen.getByRole('link', { name: 'התחברות' })).toBeInTheDocument()
    first.unmount()

    answer({ tier: 'gold' }, false)
    render(<AccountMenu />)
    await open()
    expect(screen.queryByTestId('account-menu-club')).toBeNull()
  })
})
