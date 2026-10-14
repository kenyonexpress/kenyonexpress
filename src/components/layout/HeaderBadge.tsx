'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * The count badge on a masthead icon: the cart's item count and the heart's
 * saved count, one component so the two cannot drift.
 *
 * The shape is CSS (`.header-badge` in globals.css), two measured variants
 * switched on the same `xl` breakpoint the header's two clusters switch on:
 * live's 20px dark handheld counter and its 21px yellow masthead one. This
 * file owns only what CSS cannot know: when the count CHANGED.
 *
 * THE POP, AND WHEN IT MUST NOT FIRE. `.header-badge--bump` runs the scale
 * keyframe once. The obvious trigger, "the count is different from last
 * render", fires on every page load: the cart mirror rehydrates in an effect
 * after mount, so the count goes 0 -> N on each navigation, and a badge that
 * pops on arrival is a badge that is always popping. So the caller passes
 * `armed`, true once its store has settled (the server cart has landed; the
 * wishlist has loaded), and a change only pops when the store was ALREADY
 * armed before it: the mirror's 0 -> N lands unarmed, the shopper's add lands
 * armed. The class is cleared on `animationend`, which still fires under
 * `prefers-reduced-motion` because the global rule shortens the animation
 * rather than removing it.
 */

type Props = {
  count: number
  /** True once the owning store has settled; a change before that is a load, not an action. */
  armed: boolean
}

export function useCountBump(count: number, armed: boolean): [boolean, () => void] {
  const previous = useRef({ count, armed })
  const [bump, setBump] = useState(false)

  useEffect(() => {
    const was = previous.current
    previous.current = { count, armed }
    if (was.armed && armed && count > 0 && count !== was.count) setBump(true)
  }, [count, armed])

  return [bump, () => setBump(false)]
}

export default function HeaderBadge({ count, armed }: Props) {
  const [bump, settle] = useCountBump(count, armed)
  if (count <= 0) return null
  return (
    <span
      className={bump ? 'header-badge header-badge--bump' : 'header-badge'}
      data-bump={bump ? '' : undefined}
      onAnimationEnd={settle}
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
