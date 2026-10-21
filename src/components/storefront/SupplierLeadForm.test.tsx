import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SupplierLeadForm from './SupplierLeadForm'

vi.mock('@/components/shared/TurnstileWidget', () => ({ default: () => null }))
vi.mock('@/lib/security/turnstile-client', () => ({ resetTurnstile: vi.fn() }))
vi.mock('@/server/actions/supplier-lead', () => ({ submitSupplierLead: vi.fn() }))

const CLAUSES = ['סעיף ראשון.', 'סעיף שני.'] as const

function renderForm() {
  return render(
    <SupplierLeadForm agreementHash="abc" agreementVersion="2026-10-16" clauses={CLAUSES} />,
  )
}

describe('SupplierLeadForm click-wrap', () => {
  it('lists the clauses the hash was computed from', () => {
    renderForm()
    for (const clause of CLAUSES) expect(screen.getByText(clause)).toBeTruthy()
    expect(screen.getByDisplayValue('abc')).toBeTruthy()
  })

  it('names the counterparty and its registration number under the clauses', () => {
    renderForm()
    const line = screen.getByText(/הצד השני להסכם/)
    expect(line.textContent).toContain('קניון אקספרס, מספר עוסק 033798513')
    // Outside the hashed text: the fieldset holds it, the <ol> does not.
    expect(line.closest('fieldset')).not.toBeNull()
    expect(line.closest('ol')).toBeNull()
  })
})
