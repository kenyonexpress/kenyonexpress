import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE SITE NEVER STARTS A WHATSAPP CONVERSATION FROM A SHARE OR CONTACT SURFACE.
 *
 * Every share button, question link, order-contact link and contact-menu row
 * is a `wa.me` link the customer clicks and then sends from their own client.
 * The provider-backed sender (`src/server/whatsapp/*`, the `whatsapp_outbox`
 * drain) exists for opted-in order-status notices only and must stay out of
 * these components. This test turns that sentence into a gate: a share or
 * contact component that imports the sender, or names the outbox, fails here.
 *
 * Paths resolve from `process.cwd()`: jsdom rewrites `import.meta.url`.
 */
const SURFACES = [
  'src/components/contact',
  'src/components/shared',
  'src/lib/contact',
  'src/lib/share',
]
const FORBIDDEN = [
  /server\/whatsapp/,
  /whatsapp_outbox/,
  /sendWhatsAppMessage/,
  /fn_enqueue_whatsapp/,
  /api\.twilio\.com/,
]

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir))
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
    .map((name) => join(dir, name))
}

describe('share and contact surfaces are click-to-chat only', () => {
  const files = SURFACES.flatMap(sourceFiles)

  it('covers the surfaces this gate exists for', () => {
    expect(files).toContain(join('src/components/shared', 'ProductShareRow.tsx'))
    expect(files).toContain(join('src/components/contact', 'ProductQuestionLink.tsx'))
    expect(files).toContain(join('src/components/contact', 'ContactTopicPicker.tsx'))
    expect(files).toContain(join('src/lib/contact', 'inquiry-links.ts'))
  })

  it.each(files)('%s does not reach the outbound sender', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern)
  })

  it('every wa.me helper builds a link, not a request', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/whatsapp.ts'), 'utf8')
    expect(source).not.toMatch(/fetch\(/)
    expect(source).toContain('https://wa.me/')
  })
})
