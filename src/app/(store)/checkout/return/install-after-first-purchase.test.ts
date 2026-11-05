import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * S32. The install invitation belongs to one moment: the confirmation of the
 * customer's FIRST paid order. The component's own behaviour is covered in
 * `components/pwa/install-prompt.test.tsx`, and the gate in
 * `server/queries/first-purchase.test.ts`. What neither can see is the wiring
 * between them, in a server component that reads the database and so is not
 * rendered here. This reads the page instead and locks the three facts that
 * make "after first purchase" true.
 */

const page = readFileSync('src/app/(store)/checkout/return/page.tsx', 'utf8')

describe('order confirmation: install invitation after the first purchase', () => {
  it('renders the first-purchase invitation exactly once', () => {
    expect(page.match(/<InstallPrompt\b/g)).toHaveLength(1)
    expect(page).toContain('<InstallPrompt moment="first-purchase" />')
  })

  it('renders it only in the branch isFirstPaidOrder answered true', () => {
    const gate = page.indexOf('await isFirstPaidOrder(admin, order.id)')
    const prompt = page.indexOf('<InstallPrompt moment="first-purchase" />')
    const otherwise = page.indexOf('<PostPurchasePushPrompt />')

    expect(gate).toBeGreaterThan(-1)
    expect(otherwise).toBeGreaterThan(-1)
    // gate ? ( ...banner... prompt ) : ( push prompt )
    expect(prompt).toBeGreaterThan(gate)
    expect(prompt).toBeLessThan(otherwise)
    expect(page.slice(gate, prompt)).not.toContain(') : (')
  })

  it('shows it under the first-purchase banner, not instead of it', () => {
    const banner = page.indexOf('<FirstPurchaseBanner')
    const prompt = page.indexOf('<InstallPrompt moment="first-purchase" />')
    expect(banner).toBeGreaterThan(-1)
    expect(banner).toBeLessThan(prompt)
  })
})
