'use client'

import { duplicateProduct } from '@/server/actions/admin/product-duplicate'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * Duplicate, then go straight to the copy's edit page.
 *
 * THE NAVIGATION IS THE FEATURE. A duplicate that leaves the operator on the
 * list has produced a draft called "X (עותק)" somewhere below the fold, which
 * they then have to find - and the whole point of duplicating is that the next
 * thing you do is change the two fields that differ. Landing in the editor is
 * what makes it one action instead of three.
 *
 * NO CONFIRMATION DIALOGUE. The copy is a draft with no stock and its own slug,
 * so a mis-click costs one row an operator can archive. Asking would train
 * people to click through the dialogue that guards deletion.
 */
export default function DuplicateProductButton({ productId }: { productId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const result = await duplicateProduct(productId)
            if (!result.ok) {
              setError(result.error)
              return
            }
            router.push(`/admin/products/${result.id}/edit`)
          })
        }
        className="text-sm text-black underline-offset-2 hover:underline disabled:opacity-50"
      >
        {pending ? 'משכפל...' : 'שכפול'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </>
  )
}
