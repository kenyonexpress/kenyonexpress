'use client'

import { t } from '@/lib/i18n/messages'
import { Navigation } from 'lucide-react'
import { type NearMeError, useNearMe } from './use-near-me'

const ERROR_KEY: Record<NearMeError, Parameters<typeof t>[0]> = {
  unsupported: 'filterChips.nearMeUnsupported',
  invalid: 'filterChips.nearMeInvalid',
  denied: 'filterChips.nearMeDenied',
  failed: 'filterChips.nearMeFailed',
}

/**
 * The "near me" chip. A button, not a link: there is no URL for it until the
 * customer has agreed to share a position, and that agreement is the click.
 * `aria-pressed` carries the on/off state; the row's other chips are links and
 * use `aria-current`, and the stylesheet paints both the same.
 */
export default function NearMeChip() {
  const { nearActive, locating, error, toggle } = useNearMe()
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={locating}
        aria-pressed={nearActive}
        className="category-chips__chip category-chips__chip--button"
        data-testid="filter-chip-near"
      >
        <Navigation size={13} aria-hidden="true" />
        {locating ? t('filterChips.locating') : t('filterChips.nearMe')}
      </button>
      {error && (
        <output className="category-chips__note" aria-live="polite">
          {t(ERROR_KEY[error])}
        </output>
      )}
    </>
  )
}
