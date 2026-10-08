import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Four switches, polarity "shown". Pinned: a muted shelf renders unchecked
 * with its chip; unchecking sends `muted = true` for that shelf and refreshes
 * on success; a rejected save flips the one switch back and says why, leaving
 * the others alone.
 */

const mock = vi.hoisted(() => ({
  calls: [] as [string, boolean][],
  result: { ok: true } as { ok: boolean; error?: string },
  refreshes: 0,
}))

vi.mock('@/server/actions/notifications', () => ({
  setCategoryMute: async (category: string, muted: boolean) => {
    mock.calls.push([category, muted])
    return mock.result
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: () => {
      mock.refreshes += 1
    },
  }),
}))

import CategoryMuteSwitches from './CategoryMuteSwitches'

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  mock.calls = []
  mock.result = { ok: true }
  mock.refreshes = 0
})

describe('CategoryMuteSwitches', () => {
  it('renders one switch per shelf, muted ones unchecked and chipped', () => {
    render(<CategoryMuteSwitches muted={['deals']} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(4)
    expect(screen.getByRole('checkbox', { name: /מבצעים/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /הזמנות/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /מבצעים/ }).closest('label')).toHaveTextContent(
      'מושתק',
    )
  })

  it('mutes on uncheck and refreshes the page data on success', async () => {
    render(<CategoryMuteSwitches muted={[]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /חשבון/ }))
    await flush()
    expect(mock.calls).toEqual([['account', true]])
    expect(screen.getByRole('checkbox', { name: /חשבון/ })).not.toBeChecked()
    expect(mock.refreshes).toBe(1)
  })

  it('unmutes on check', async () => {
    render(<CategoryMuteSwitches muted={['system']} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /מערכת/ }))
    await flush()
    expect(mock.calls).toEqual([['system', false]])
  })

  it('rolls back only the failed switch and shows the reason', async () => {
    mock.result = { ok: false, error: 'השמירה נכשלה.' }
    render(<CategoryMuteSwitches muted={[]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /הזמנות/ }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('השמירה נכשלה.')
    expect(screen.getByRole('checkbox', { name: /הזמנות/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /מבצעים/ })).toBeChecked()
    expect(mock.refreshes).toBe(0)
  })

  it('says what a mute does not touch', () => {
    render(<CategoryMuteSwitches muted={[]} />)
    expect(screen.getByText(/אינה משנה מייל/)).toBeInTheDocument()
  })
})
