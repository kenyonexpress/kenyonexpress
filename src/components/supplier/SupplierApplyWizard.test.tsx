import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Walking the wizard's steps never posts the application.
 *
 * V06 measured "המשך" on step 2 submitting the form: React reused the one
 * <button> node for both "המשך" and "שליחת הבקשה" and changed its type inside
 * the click, so the browser ran the submit default of that same click.
 *
 * jsdom does not run a button's activation behaviour after React's re-render
 * the way Chromium does, so a submit listener alone passes with or without the
 * bug. The node identity is what actually fails without the fix.
 */

const submitMock = vi.fn()

vi.mock('@/server/actions/supplier-onboarding', () => ({
  submitSupplierApplication: (...args: unknown[]) => {
    submitMock(...args)
    return { ok: false }
  },
  requestDocumentUpload: vi.fn(),
}))

import SupplierApplyWizard from './SupplierApplyWizard'

beforeEach(() => {
  submitMock.mockReset()
})

describe('SupplierApplyWizard', () => {
  it('reaches the last step without submitting', async () => {
    const { container } = render(<SupplierApplyWizard contractText="הסכם" contractVersion="v1" />)
    const form = container.querySelector('form') as HTMLFormElement
    const onSubmit = vi.fn()
    form.addEventListener('submit', onSubmit)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'המשך' }))
    })
    const next = screen.getByRole('button', { name: 'המשך' })
    await act(async () => {
      fireEvent.click(next)
    })

    const submit = screen.getByRole('button', { name: 'שליחת הבקשה' })
    expect(submit).not.toBe(next)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(submitMock).not.toHaveBeenCalled()
  })
})
