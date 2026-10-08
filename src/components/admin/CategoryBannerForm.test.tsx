import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * The category-banner composer (STEP 62). Pinned: the uploaded image rides
 * in a hidden `image_url` field and the submit stays disabled without one,
 * the window fields say what empty means, a half CTA and an external CTA are
 * warned about before the round trip, the preview follows the copy and the
 * theme, and an existing banner's values prefill the form.
 */

const mock = vi.hoisted(() => ({
  state: { ok: false } as { ok: boolean; error?: string; fieldErrors?: Record<string, string[]> },
}))

vi.mock('@/server/actions/admin/category-banners', () => ({ saveCategoryBanner: vi.fn() }))
vi.mock('@/components/admin/ImageUploader', () => ({
  default: ({ onChange }: { onChange: (urls: string[]) => void }) => (
    <button type="button" onClick={() => onChange(['https://cdn.example/b.webp'])}>
      העלאה מדומה
    </button>
  ),
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: () => [mock.state, vi.fn(), false],
  }
})

import CategoryBannerForm from './CategoryBannerForm'

const CATEGORIES = [
  { id: '33333333-3333-4333-8333-333333333333', name_he: 'מבצעים חמים', slug: 'hot-deals' },
  { id: '44444444-4444-4444-8444-444444444444', name_he: 'חדש', slug: 'new' },
]

const imageField = (container: HTMLElement) =>
  container.querySelector('input[name="image_url"]') as HTMLInputElement

describe('CategoryBannerForm', () => {
  it('starts with no image, the submit disabled, and the picker offering every category', () => {
    const { container } = render(<CategoryBannerForm categories={CATEGORIES} />)
    expect(imageField(container).value).toBe('')
    expect((screen.getByRole('button', { name: 'שמירה' }) as HTMLButtonElement).disabled).toBe(true)
    const select = screen.getByLabelText('הקטגוריה') as HTMLSelectElement
    expect(select.options.length).toBe(3)
    expect(screen.getByText('ריק = מיד עם השמירה')).toBeTruthy()
    expect(screen.getByText('ריק = עד שיכובה')).toBeTruthy()
  })

  it('takes the uploaded URL into the hidden field and enables the submit', () => {
    const { container } = render(<CategoryBannerForm categories={CATEGORIES} />)
    fireEvent.click(screen.getByRole('button', { name: 'העלאה מדומה' }))
    expect(imageField(container).value).toBe('https://cdn.example/b.webp')
    expect((screen.getByRole('button', { name: 'שמירה' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('warns about a half CTA and about an external link, and shows neither for a good pair', () => {
    render(<CategoryBannerForm categories={CATEGORIES} />)
    fireEvent.change(screen.getByLabelText('טקסט הכפתור (לא חובה)'), { target: { value: 'לחצו' } })
    expect(screen.getByTestId('cta-warning').textContent).toContain('גם טקסט וגם קישור')

    fireEvent.change(screen.getByLabelText('קישור הכפתור'), {
      target: { value: 'https://evil.example' },
    })
    expect(screen.getByTestId('cta-warning').textContent).toContain('פנימי')

    fireEvent.change(screen.getByLabelText('קישור הכפתור'), { target: { value: '/products' } })
    expect(screen.queryByTestId('cta-warning')).toBeNull()
  })

  it('previews the copy and follows the theme', () => {
    render(<CategoryBannerForm categories={CATEGORIES} />)
    const preview = screen.getByTestId('banner-preview')
    expect(preview.textContent).toContain('הכותרת תופיע כאן')

    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'מבצעי החורף' } })
    fireEvent.change(screen.getByLabelText('שורת משנה (לא חובה)'), {
      target: { value: 'עד 40% הנחה' },
    })
    expect(preview.textContent).toContain('מבצעי החורף')
    expect(preview.textContent).toContain('עד 40% הנחה')
    expect(preview.innerHTML).toContain('text-white')

    fireEvent.change(screen.getByLabelText('צבע הטקסט'), { target: { value: 'dark' } })
    expect(preview.innerHTML).toContain('text-gray-900')
    expect(preview.innerHTML).not.toContain('bg-gradient-to-l')
  })

  it('prefills an existing banner, window in the admin’s zone, and carries its id', () => {
    const { container } = render(
      <CategoryBannerForm
        categories={CATEGORIES}
        initial={{
          id: '22222222-2222-4222-8222-222222222222',
          category_id: CATEGORIES[1]?.id ?? '',
          title_he: 'קיים',
          subtitle_he: null,
          image_url: 'https://cdn.example/old.webp',
          image_alt_he: 'תמונה קיימת',
          cta_label_he: 'לכל המבצעים',
          cta_href: '/products',
          theme: 'dark',
          starts_at: '2026-10-09T10:00:00Z',
          ends_at: null,
          priority: 7,
          is_active: false,
          created_at: '2026-10-08T10:00:00Z',
          updated_at: '2026-10-08T10:00:00Z',
          category_name_he: 'חדש',
          category_slug: 'new',
          impressions: 10,
          clicks: 1,
          ctr: 10,
        }}
      />,
    )
    expect((container.querySelector('input[name="id"]') as HTMLInputElement).value).toBe(
      '22222222-2222-4222-8222-222222222222',
    )
    expect(imageField(container).value).toBe('https://cdn.example/old.webp')
    expect((screen.getByLabelText('כותרת') as HTMLInputElement).value).toBe('קיים')
    expect((screen.getByLabelText('הקטגוריה') as HTMLSelectElement).value).toBe(CATEGORIES[1]?.id)
    expect((screen.getByLabelText('עדיפות') as HTMLInputElement).value).toBe('7')
    expect((screen.getByLabelText('צבע הטקסט') as HTMLSelectElement).value).toBe('dark')
    const starts = screen.getByLabelText('תחילת ההצגה') as HTMLInputElement
    expect(starts.value).toMatch(/^2026-10-09T\d{2}:\d{2}$/)
    expect((screen.getByLabelText('סיום ההצגה') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('פעיל') as HTMLInputElement).checked).toBe(false)
  })

  it('shows the action error and the field errors', () => {
    mock.state = {
      ok: false,
      error: 'טבלת הבאנרים עוד לא הוחלה (מיגרציה 267).',
      fieldErrors: { cta_href: ['הקישור חייב להיות נתיב פנימי שמתחיל ב-/'] },
    }
    render(<CategoryBannerForm categories={CATEGORIES} />)
    const alerts = screen.getAllByRole('alert').map((el) => el.textContent)
    expect(alerts.some((t) => t?.includes('267'))).toBe(true)
    expect(alerts.some((t) => t?.includes('נתיב פנימי'))).toBe(true)
    mock.state = { ok: false }
  })
})
