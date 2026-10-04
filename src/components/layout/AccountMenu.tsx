'use client'

import User from '@/components/icons/electro/User'
import { t } from '@/lib/i18n/messages'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * The masthead's account icon and the panel under it: Electro header-v8's
 * `.header-icon__user-account` with its `.dropdown-menu-user-account`.
 *
 * MEASURED off the live template at 1440 on 2026-10-05
 * (refs/electro-header-icons.json, `userAccountDropdown`): a 220px panel on a
 * 2px rgb(254,215,0) top border, 8px 0 padding, 0 0 7px 7px radius and a
 * 0 2px 5px rgba(0,0,0,.28) shadow, holding two centred 12px blocks -- a
 * "returning customer" line over a yellow sign-in button, then a rule and a
 * "no account" line over a plain register link. The paint is in
 * src/styles/header-icons.css; this file is the behaviour and the copy.
 *
 * Electro's trigger is an `<a href="/my-account/">` that Bootstrap turns into
 * a toggle. Here it is a real button: a link that never navigates is a lie to
 * assistive tech, and the two destinations are inside the panel.
 *
 * HOVER IS NOT THE ONLY WAY IN, the same rule RegionMenu follows: hover opens
 * on devices that hover; click, Enter, Space and ArrowDown open it too; Escape
 * closes and hands focus back; a click outside closes. Hover and click are
 * separate inputs and `open` is their union, because a single toggled boolean
 * is unopenable by a tap (mouseenter opens, the click toggles it shut).
 *
 * NO `usePathname()` and no session read: this is mounted by the shared header
 * on every prerendered route, and either would opt the subtree into dynamic
 * rendering under `cacheComponents`. A signed-in visitor who presses sign in
 * lands on /login, which already sends them to their account.
 */
export default function AccountMenu() {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const close = useCallback(() => {
    setPinned(false)
    setHovered(false)
  }, [])

  const closeAndRefocus = useCallback(() => {
    close()
    triggerRef.current?.focus()
  }, [close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeAndRefocus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closeAndRefocus])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setPinned(true)
      requestAnimationFrame(() => {
        wrapRef.current?.querySelector<HTMLAnchorElement>('a[data-account-item]')?.focus()
      })
    }
  }

  return (
    <div
      ref={wrapRef}
      className="header-icon header-icon--account"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('nav.account')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setPinned((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className="header-icon__trigger"
      >
        <span className="header-icon__glyph">
          <User />
        </span>
      </button>

      {open ? (
        <div id={menuId} dir="rtl" className="header-icon__menu">
          <div className="header-icon__menu-inner">
            <div className="header-icon__sign-in">
              <p>{t('nav.returningCustomer')}</p>
              <div className="header-icon__sign-in-action">
                <Link
                  href="/login"
                  data-account-item=""
                  onClick={close}
                  className="header-icon__sign-in-button"
                >
                  {t('auth.login')}
                </Link>
              </div>
            </div>
            <div className="header-icon__register">
              <p>{t('nav.noAccountYet')}</p>
              <div className="header-icon__register-action">
                <Link href="/signup" data-account-item="" onClick={close}>
                  {t('auth.signup')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
