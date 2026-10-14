import { LOGIN_DIALOG_EVENT, openLoginDialog } from '@/lib/auth/login-dialog'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type LoginDialogRequest, useLoginDialogRequest } from './useLoginDialogRequest'

/**
 * The claim that stops a login link's navigation is made by this hook, which
 * is mounted from hydration, not by the dialog chunk that arrives later.
 */

function Harness({ seen }: { seen: Array<LoginDialogRequest | null> }) {
  const request = useLoginDialogRequest()
  seen.push(request)
  return request ? <output data-testid="req">{`${request.seq}:${request.next}`}</output> : null
}

describe('useLoginDialogRequest', () => {
  it('starts with no request and claims the first press with the link’s next', () => {
    const seen: Array<LoginDialogRequest | null> = []
    const { getByTestId } = render(<Harness seen={seen} />)
    expect(seen[0]).toBeNull()
    let claimed = false
    act(() => {
      claimed = openLoginDialog({ next: '/gift/abc' })
    })
    expect(claimed).toBe(true)
    expect(getByTestId('req').textContent).toBe('1:/gift/abc')
  })

  it('defaults next to the page with its query and remembers the opener and the path', () => {
    window.history.replaceState(null, '', '/search?q=%D7%96%D7%95%D7%92')
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const seen: Array<LoginDialogRequest | null> = []
    render(<Harness seen={seen} />)
    act(() => {
      openLoginDialog()
    })
    const last = seen[seen.length - 1]
    expect(last?.next).toBe('/search?q=%D7%96%D7%95%D7%92')
    expect(last?.opener).toBe(trigger)
    expect(last?.pathname).toBe('/search')
    trigger.remove()
  })

  it('carries the body the press asked for, login unless the detail says signup (UX24)', () => {
    const seen: Array<LoginDialogRequest | null> = []
    render(<Harness seen={seen} />)
    act(() => {
      openLoginDialog({ next: '/a' })
    })
    expect(seen[seen.length - 1]?.mode).toBe('login')
    act(() => {
      openLoginDialog({ next: '/a', mode: 'signup' })
    })
    expect(seen[seen.length - 1]?.mode).toBe('signup')
    act(() => {
      openLoginDialog()
    })
    expect(seen[seen.length - 1]?.mode).toBe('login')
  })

  it('counts presses so a second one after a close is a new request', () => {
    const seen: Array<LoginDialogRequest | null> = []
    const { getByTestId } = render(<Harness seen={seen} />)
    act(() => {
      openLoginDialog({ next: '/a' })
    })
    act(() => {
      openLoginDialog({ next: '/a' })
    })
    expect(getByTestId('req').textContent).toBe('2:/a')
  })

  it('stops claiming once unmounted, so the link navigates again', () => {
    const { unmount } = render(<Harness seen={[]} />)
    unmount()
    const event = new CustomEvent(LOGIN_DIALOG_EVENT, { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
