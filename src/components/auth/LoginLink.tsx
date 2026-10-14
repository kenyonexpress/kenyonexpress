'use client'

import {
  currentLocationNext,
  isPlainActivation,
  modeFromAuthHref,
  nextFromLoginHref,
  openLoginDialog,
} from '@/lib/auth/login-dialog'
import Link from 'next/link'
import type { ComponentProps, MouseEvent } from 'react'

type LinkProps = ComponentProps<typeof Link>

/**
 * A link to /login (or /signup, UX24) that opens the auth dialog instead
 * when one is mounted (UX23).
 *
 * It renders the SAME anchor it always did: `href="/login"`,
 * `/login?next=...` or `/signup?next=...`, the caller's className, the
 * caller's children. Nothing about the markup says "dialog", so a crawler, a
 * reader without JavaScript, a middle-click and a route group with no dialog
 * all get the page.
 *
 * On a plain primary click it asks the dialog to open on the body the href
 * names, with the link's own `next` (or, for a bare `/login`, the page the
 * shopper is on), and stops the navigation only if a host claimed the
 * request.
 */
export default function LoginLink({ href, onClick, ...rest }: LinkProps) {
  const hrefString = typeof href === 'string' ? href : (href.pathname ?? '/login')
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (!isPlainActivation(event)) return
    const next = nextFromLoginHref(hrefString) ?? currentLocationNext(window.location)
    if (openLoginDialog({ next, mode: modeFromAuthHref(hrefString) })) event.preventDefault()
  }
  return <Link href={href} onClick={handleClick} {...rest} />
}
