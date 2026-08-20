import {
  Body,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'
import { siteOrigin } from './format.ts'

/**
 * The shell every KenyonExpress email is rendered inside.
 *
 * FOUR THINGS IN HERE ARE NOT COSMETIC.
 *
 * 1. **`dir="rtl"` is on the elements, not only on `<Html>`.** Outlook's Word
 *    renderer ignores an inherited direction, and a Hebrew paragraph that
 *    inherits LTR puts the full stop on the wrong end of every line. Every
 *    block below carries its own `dir`.
 *
 * 2. **Heebo is declared and immediately fallen back from.** Gmail's web client
 *    strips `@font-face` outright and most others ignore it, so the fallback
 *    stack is what the majority of readers actually see. Declaring the webfont
 *    is still worth it for Apple Mail and iOS, which honour it; declaring it
 *    *without* a real fallback is what produces Times New Roman Hebrew.
 *
 * 3. **`#fed700` is the site's brand token**, read from
 *    `src/app/globals.css:17` (`--color-brand-primary`). The two older email
 *    builders in `src/lib/email/` hardcode `#f5c518`, which is not that colour
 *    and never was; these templates use the real one.
 *
 * 4. **Ink on yellow, not white on yellow.** `#fed700` against white text is
 *    about 1.5:1. The header text is `#1a1a1a` for the same reason the site's
 *    buttons are.
 *
 * The logo is referenced by absolute URL. Emails are read months later by a
 * client that will not have our stylesheet, our fonts or our relative paths,
 * and `alt` carries the brand for everyone with images off.
 */

export const BRAND = '#fed700'
export const INK = '#1a1a1a'
export const MUTED = '#6b7280'
export const LINE = '#e5e7eb'
export const PAPER = '#ffffff'
export const CANVAS = '#f6f6f4'

const FONT_STACK = 'Heebo, Arial, "Segoe UI", Tahoma, sans-serif'

export interface LayoutProps {
  /** The line a client shows next to the subject in the inbox list. */
  preview: string
  /** Origin with no trailing slash. */
  siteUrl: string
  heading: string
  children: ReactNode
}

export function Layout({ preview, siteUrl, heading, children }: LayoutProps) {
  const site = siteOrigin(siteUrl)

  return (
    <Html dir="rtl" lang="he">
      <Head>
        <Font
          fontFamily="Heebo"
          fallbackFontFamily={['Arial', 'Tahoma']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/heebo/v26/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSycckOnz02SXQ.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header} dir="rtl">
            <Img
              src={`${site}/logo.png`}
              width="132"
              alt="KenyonExpress"
              style={{ display: 'block', margin: '0 auto 10px', border: '0' }}
            />
            <Heading as="h1" style={headerHeading} dir="rtl">
              {heading}
            </Heading>
          </Section>

          <Section style={sheet} dir="rtl">
            {children}
          </Section>

          <Hr style={{ borderColor: LINE, margin: '24px 0 12px' }} />

          <Section dir="rtl">
            <Text style={footer} dir="rtl">
              נשלח על ידי{' '}
              <Link href={site} style={{ color: INK, textDecoration: 'underline' }}>
                KenyonExpress
              </Link>
            </Text>
            <Text style={footer} dir="rtl">
              שאלה על ההזמנה? השיבו למייל הזה ונחזור אליכם.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/**
 * A bordered card. Every template stacks these rather than nesting tables,
 * because a nested table is where Outlook's renderer starts inventing gaps.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <Section style={card} dir="rtl">
      {children}
    </Section>
  )
}

/**
 * A label above its value, stacked rather than side by side.
 *
 * Two columns are what a designer draws and what a 320px phone destroys: the
 * label wraps, the value wraps under it, and the pair no longer reads as a
 * pair. Stacked survives every width.
 */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ margin: '0 0 10px' }} dir="rtl">
      <Text style={fieldLabel} dir="rtl">
        {label}
      </Text>
      <Text style={fieldValue} dir="rtl">
        {value}
      </Text>
    </Section>
  )
}

/** The one number a reader must not miss: an amount, a code. */
export function Emphasis({ label, value }: { label: string; value: string }) {
  return (
    <Section style={emphasis} dir="rtl">
      <Text style={{ ...fieldLabel, color: INK }} dir="rtl">
        {label}
      </Text>
      <Text style={emphasisValue} dir="rtl">
        {value}
      </Text>
    </Section>
  )
}

const body = {
  backgroundColor: CANVAS,
  color: INK,
  fontFamily: FONT_STACK,
  margin: '0',
  padding: '24px 0',
}

const container = {
  backgroundColor: PAPER,
  borderRadius: '16px',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '0 0 20px',
  width: '100%',
}

const header = {
  backgroundColor: BRAND,
  borderRadius: '16px 16px 0 0',
  padding: '24px 20px',
  textAlign: 'center' as const,
}

const headerHeading = {
  color: INK,
  fontFamily: FONT_STACK,
  fontSize: '22px',
  fontWeight: 700,
  lineHeight: '1.35',
  margin: '0',
}

const sheet = {
  padding: '22px 20px 0',
}

const card = {
  backgroundColor: PAPER,
  border: `1px solid ${LINE}`,
  borderRadius: '14px',
  margin: '0 0 14px',
  padding: '18px',
}

const fieldLabel = {
  color: MUTED,
  fontFamily: FONT_STACK,
  fontSize: '12px',
  lineHeight: '1.4',
  margin: '0 0 2px',
}

const fieldValue = {
  color: INK,
  fontFamily: FONT_STACK,
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: '1.5',
  margin: '0',
}

const emphasis = {
  backgroundColor: '#fffbe6',
  border: `1px solid ${BRAND}`,
  borderRadius: '12px',
  margin: '0 0 12px',
  padding: '14px 16px',
}

const emphasisValue = {
  color: INK,
  fontFamily: FONT_STACK,
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '1.4',
  margin: '0',
}

const footer = {
  color: MUTED,
  fontFamily: FONT_STACK,
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0 0 4px',
  textAlign: 'center' as const,
}

export const styles = {
  body,
  container,
  header,
  headerHeading,
  sheet,
  card,
  fieldLabel,
  fieldValue,
  footer,
  fontStack: FONT_STACK,
}
