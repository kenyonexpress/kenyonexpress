'use client'

import { t } from '@/lib/i18n/messages'
import { ALLOWED_MIME, MAX_ALT_LENGTH, type SubmissionKind } from '@/lib/supplier/image-submissions'
import { submitSupplierImage } from '@/server/actions/supplier/image-submission'
import { useRef, useState, useTransition } from 'react'

/**
 * Upload one image for approval: a product's photo or the shop logo.
 * Multipart straight to the server action; the file never touches a public
 * bucket from the browser (see the action for why).
 */
export default function ImageSubmissionForm({
  kind,
  productId,
}: {
  kind: SubmissionKind
  productId?: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const scope = productId ?? kind
  const fileId = `image-file-${scope}`
  const altId = `image-alt-${scope}`

  return (
    <form
      ref={formRef}
      className="mt-3 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await submitSupplierImage(formData)
          setState({
            ok: result.ok,
            text: result.ok ? (result.message ?? '') : (result.error ?? ''),
          })
          if (result.ok) formRef.current?.reset()
        })
      }}
    >
      <p className="text-sm font-semibold text-heading">
        {kind === 'logo' ? t('supplier.uploadLogoHeading') : t('supplier.uploadImageHeading')}
      </p>
      <input type="hidden" name="kind" value={kind} />
      {productId ? <input type="hidden" name="product_id" value={productId} /> : null}
      <label className="block text-xs text-gray-600" htmlFor={fileId}>
        {t('supplier.uploadFileLabel')}
      </label>
      <input
        id={fileId}
        name="file"
        type="file"
        accept={ALLOWED_MIME.join(',')}
        required
        className="block w-full text-sm"
      />
      <label className="block text-xs text-gray-600" htmlFor={altId}>
        {t('supplier.uploadAltLabel')}
      </label>
      <input
        id={altId}
        name="alt_he"
        maxLength={MAX_ALT_LENGTH}
        required
        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {t('supplier.uploadSubmit')}
      </button>
      {state ? (
        <output className={`block text-xs ${state.ok ? 'text-green-700' : 'text-red-700'}`}>
          {state.text}
        </output>
      ) : null}
    </form>
  )
}
