import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const createDealFromTemplate = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({ ok: false as const, error: 'stub' })),
)
const cloneDealTemplate = vi.hoisted(() =>
  vi.fn(async (input: { slug: string }) => ({ ok: true as const, slug: input.slug })),
)
vi.mock('@/server/actions/admin/deal-templates', () => ({
  createDealFromTemplate,
  cloneDealTemplate,
}))
vi.mock('@/server/actions/admin/images', () => ({ processAndUploadImage: vi.fn() }))
vi.mock('next/image', () => ({
  // biome-ignore lint/a11y/useAltText: passthrough stub, alt arrives via props
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}))

import type { DealTemplate } from '@/lib/deal-templates/common'
import masters from '@/lib/deal-templates/masters.json'
import DealWizard from './DealWizard'

const templates = masters as unknown as DealTemplate[]
const categories = [
  { id: '11111111-1111-4111-8111-111111111111', name_he: 'צימרים מלונות ונופש', slug: 'vacation' },
]

function renderWizard() {
  return render(
    <DealWizard templates={templates} categories={categories} suppliers={[]} canPublish />,
  )
}

describe('DealWizard', () => {
  it('step 1 lists every master and filters by search', () => {
    renderWizard()
    expect(screen.getAllByRole('listitem')).toHaveLength(templates.length)
    fireEvent.change(screen.getByLabelText('חיפוש תבנית'), { target: { value: 'צימר' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('step 2 renders the master fields in Hebrew and updates the live preview in whole shekels', () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: /צימר/ }))
    for (const label of [
      'מספר לילות *',
      'מספר אורחים מקסימלי *',
      'שעות כניסה ויציאה *',
      'מחיר לסוף שבוע (₪) *',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('קטגוריה *')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('מחיר באתר (₪) *'), { target: { value: '450' } })
    fireEvent.change(screen.getByLabelText('כותרת הדיל *'), { target: { value: 'צימר בגליל' } })
    const preview = screen.getByLabelText('תצוגה מקדימה')
    expect(preview.textContent).toContain('צימר בגליל')
    expect(preview.textContent).toMatch(/450/)
    expect(preview.textContent).not.toMatch(/450\.00/)
    expect(preview.textContent).toContain('שובר בתוקף 90 ימים')
  })

  it('blocks publish with every error at once and never calls the server', async () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: /אייפון/ }))
    fireEvent.click(screen.getByRole('button', { name: 'פרסום' }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(3))
    expect(screen.getByText('גלריה: נדרשת לפחות תמונה אחת לפרסום')).toBeTruthy()
    expect(createDealFromTemplate).not.toHaveBeenCalled()
  })

  it('clones the closest master into a new one and opens it', async () => {
    renderWizard()
    fireEvent.click(screen.getByRole('button', { name: /יצירת תבנית חדשה/ }))
    fireEvent.change(screen.getByLabelText('התבנית הקרובה ביותר'), { target: { value: 'massage' } })
    fireEvent.change(screen.getByLabelText('שם התבנית החדשה *'), {
      target: { value: 'עיסוי רקמות' },
    })
    fireEvent.change(screen.getByLabelText('מזהה באנגלית *'), { target: { value: 'deep-tissue' } })
    fireEvent.click(screen.getByRole('button', { name: 'שמירת התבנית והמשך' }))
    await waitFor(() => expect(screen.getByText('דיל חדש: עיסוי רקמות')).toBeTruthy())
    expect(cloneDealTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        source_slug: 'massage',
        slug: 'deep-tissue',
        name_he: 'עיסוי רקמות',
      }),
    )
  })
})
