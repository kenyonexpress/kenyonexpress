import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The drag-drop path shares stageFiles with the picker, but nothing else
 * exercises it: a manual test needs a real OS drag, so a regression (a missing
 * preventDefault, the depth counter going negative, a drop ignored at
 * maxFiles) ships silently. These tests pin the three behaviors that matter:
 * a drop stages files with the alt gate, a drop past maxFiles is refused, and
 * upload sends the (possibly compressed) file to the server action.
 */

const processAndUploadImage = vi.hoisted(() =>
  vi.fn(async (_formData: FormData) => ({
    url: 'https://cdn.example/p/1/w1600.webp',
    altHe: 'תמונה',
    blurDataURL: 'data:image/webp;base64,x',
    width: 1600,
    height: 1200,
  })),
)
vi.mock('@/server/actions/admin/images', () => ({ processAndUploadImage }))
vi.mock('next/image', () => ({
  // biome-ignore lint/a11y/useAltText: passthrough stub, alt arrives via props
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}))

import ImageUploader from './ImageUploader'

function jpeg(name: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
}

function dropFiles(target: Element, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files } })
}

beforeEach(() => {
  processAndUploadImage.mockClear()
  // jsdom ships URL without the object-url statics the previews need.
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('ImageUploader drag and drop', () => {
  it('stages dropped files behind the Hebrew alt gate', async () => {
    render(
      <ImageUploader bucket="product-images" folder="products" value={[]} onChange={() => {}} />,
    )

    const dropzone = screen.getByRole('button', { name: /גרירת תמונות/ })
    dropFiles(dropzone, [jpeg('a.jpg')])

    // Staged with an empty alt: the upload button exists but is disabled.
    const uploadButton = await screen.findByRole('button', { name: /העלאת 1 תמונות/ })
    expect(uploadButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText('טקסט חלופי עבור a.jpg'), {
      target: { value: 'אוזניות שחורות' },
    })
    expect(screen.getByRole('button', { name: /העלאת 1 תמונות/ })).toBeEnabled()
  })

  it('refuses a drop that would exceed maxFiles', () => {
    render(
      <ImageUploader
        bucket="product-images"
        folder="products"
        value={['https://cdn.example/existing.webp']}
        onChange={() => {}}
        maxFiles={2}
      />,
    )

    dropFiles(screen.getByRole('button', { name: /גרירת תמונות/ }), [jpeg('a.jpg'), jpeg('b.jpg')])

    expect(screen.getByText('ניתן להעלות עד 2 תמונות')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /העלאת/ })).not.toBeInTheDocument()
  })

  it('uploads a staged drop through the server pipeline and reports the url', async () => {
    const onChange = vi.fn()
    render(
      <ImageUploader bucket="product-images" folder="products" value={[]} onChange={onChange} />,
    )

    dropFiles(screen.getByRole('button', { name: /גרירת תמונות/ }), [jpeg('a.jpg')])
    fireEvent.change(await screen.findByLabelText('טקסט חלופי עבור a.jpg'), {
      target: { value: 'אוזניות שחורות' },
    })
    fireEvent.click(screen.getByRole('button', { name: /העלאת 1 תמונות/ }))

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['https://cdn.example/p/1/w1600.webp']),
    )
    const formData = processAndUploadImage.mock.calls[0]?.[0] as FormData
    expect(formData.get('alt_he')).toBe('אוזניות שחורות')
    // jsdom cannot createImageBitmap, so the compressor's fallback must have
    // sent the original file rather than failing the upload.
    expect((formData.get('file') as File).name).toBe('a.jpg')
  })
})
