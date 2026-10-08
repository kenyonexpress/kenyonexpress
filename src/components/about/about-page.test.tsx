import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import AboutPage from '@/app/(store)/about/page'
import {
  PRESS_EMPTY_COPY,
  aboutMission,
  aboutSections,
  aboutStory,
  aboutTeam,
  pressMentions,
} from '@/content/about'
import { validateJsonLd } from '@/lib/seo/json-ld-validate.mjs'
import { SUPPORT_HOURS_ROWS } from '@/lib/support-hours'
import { PUBLISHED_STORE_WHATSAPP } from '@/lib/whatsapp'
import AboutPress from './AboutPress'

/**
 * The about page prints its typed content and nothing else (STEP 53).
 *
 * Every assertion reads the same module the page reads, so adding a team
 * member or a press mention in `content/about` cannot fail here, and a
 * paragraph retyped into the page markup would.
 */
describe('/about page', () => {
  const html = renderToStaticMarkup(<AboutPage />)

  it('prints the mission, the story and every how-it-works section in order', () => {
    const headings = [aboutMission, aboutStory, ...aboutSections].map((s) => s.heading)
    const positions = headings.map((h) => html.indexOf(`>${h}<`))
    for (const [i, pos] of positions.entries()) expect(pos, headings[i]).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    for (const s of [aboutMission, aboutStory, ...aboutSections]) {
      for (const p of s.paragraphs) expect(html).toContain(p)
    }
  })

  it('names every team member with a role, one row each', () => {
    expect(html.match(/data-testid="team-member"/g)).toHaveLength(aboutTeam.length)
    for (const member of aboutTeam) {
      expect(html).toContain(member.name)
      expect(html).toContain(member.role)
      expect(html).toContain(member.about)
    }
    expect(html).toContain('אופיר')
  })

  it('shows the honest empty press state while the registry is empty, with a press mailto', () => {
    expect(pressMentions).toHaveLength(0)
    expect(html).toContain('data-testid="press-empty"')
    expect(html).toContain(PRESS_EMPTY_COPY.body)
    expect(html).not.toContain('data-testid="press-mention"')
    expect(html).toContain(
      `href="mailto:info@kenyonexpress.co.il?subject=${encodeURIComponent(PRESS_EMPTY_COPY.subject)}"`,
    )
  })

  it('offers WhatsApp, the email, the hours table and the contact page', () => {
    expect(html).toContain('data-testid="whatsapp-support"')
    expect(html).toContain(`https://wa.me/${PUBLISHED_STORE_WHATSAPP}?text=`)
    expect(html).toContain('href="mailto:info@kenyonexpress.co.il"')
    for (const row of SUPPORT_HOURS_ROWS) {
      expect(html).toContain(row.label)
      expect(html).toContain(row.hours)
    }
    expect(html).toContain('href="/contact"')
    expect(html).toContain('href="/suppliers"')
    expect(html).not.toContain('פתוח עכשיו')
  })

  it('carries valid AboutPage and Organization structured data naming the founder', () => {
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    expect(match).not.toBeNull()
    const nodes = JSON.parse(match?.[1] ?? '[]') as Record<string, unknown>[]
    expect(validateJsonLd(nodes).filter((i) => i.level === 'error')).toEqual([])
    expect(nodes.map((n) => n['@type'])).toEqual(['AboutPage', 'Organization'])
    expect(nodes[0]?.url).toMatch(/\/about$/)
    const org = nodes[1] as {
      founder: Record<string, unknown>
      contactPoint: Record<string, unknown>[]
    }
    expect(org.founder).toEqual({
      '@type': 'Person',
      name: aboutTeam[0]?.name,
      jobTitle: aboutTeam[0]?.role,
    })
    expect(org.contactPoint[0]?.telephone).toBe(`+${PUBLISHED_STORE_WHATSAPP}`)
    expect(org.contactPoint[0]?.email).toBe('info@kenyonexpress.co.il')
    expect(JSON.stringify(nodes)).not.toContain('foundingDate')
  })
})

describe('AboutPress with entries', () => {
  it('renders one linked row per article with the outlet and a dated <time>', () => {
    const html = renderToStaticMarkup(
      <AboutPress
        email="info@kenyonexpress.co.il"
        mentions={[
          {
            outlet: 'גלובס',
            title: 'כותרת הכתבה',
            url: 'https://example.com/article',
            publishedAt: '2026-10-01',
          },
        ]}
      />,
    )
    expect(html.match(/data-testid="press-mention"/g)).toHaveLength(1)
    expect(html).toContain('href="https://example.com/article"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('כותרת הכתבה')
    expect(html).toContain('גלובס')
    expect(html).toContain('<time dateTime="2026-10-01">')
    expect(html).not.toContain('data-testid="press-empty"')
  })
})
