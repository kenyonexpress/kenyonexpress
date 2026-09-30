import { RTL_ISOLATE_STYLE } from '@/lib/email/bidi'
import { OFF_PAGE } from '@/styles/tokens'

/**
 * The one HTML document every transactional mail is wrapped in.
 *
 * WHY A DOCUMENT AND NOT A <div>. Until STEP 16 each builder emitted a bare
 * `<div dir="rtl" style="max-width:560px">` fragment. That reads fine in a
 * desktop client and badly on a phone: with no viewport meta and no media
 * query, Gmail on Android and Mail on iOS render the 560px column at desktop
 * scale and let the reader pinch. A mail is responsive only when it is a full
 * document with a `<head>` the client will honour, a fluid table (`width=100%`
 * capped by `max-width`), and a `@media` block that collapses the paddings on
 * a narrow screen. Everything below is that, once, so the sixteen builders
 * cannot each drift a different way.
 *
 * WHY TABLES. Outlook (Word engine) ignores `max-width` on a div and centres
 * nothing; a `role="presentation"` table with an explicit `width` attribute is
 * the only container all clients agree on. `dir="rtl"` is set on the table
 * itself and repeated on the body, because Outlook reads the attribute and
 * not the CSS `direction`.
 *
 * WHY INLINE STYLES STAY. The `<style>` block carries ONLY the media query:
 * Gmail strips embedded styles it cannot parse and some clients drop the head
 * entirely, so every colour, size and margin that matters is still inline on
 * the element. The media rules are a progressive enhancement over that.
 *
 * COLOURS come from `OFF_PAGE` in `src/styles/tokens.ts`, never a literal:
 * `brand-colour.test.ts` and the raw-value scanner both read this file.
 */

const { ink: INK, muted: MUTED, panelWarm: PANEL_WARM } = OFF_PAGE

/** Hebrew in Heebo, Arial when the client will not load a webfont. */
export const EMAIL_FONT_STACK = 'Heebo,Arial,Helvetica,sans-serif'

/** The column width on a desktop client. Narrower screens get 100%. */
export const EMAIL_MAX_WIDTH_PX = 600

/** Below this the paddings collapse and the column goes fluid. */
export const EMAIL_MOBILE_BREAKPOINT_PX = 600

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface EmailDocumentInput {
  /** Sender identity shown in the header row. Escaped here. */
  siteName?: string
  /** `<title>`; a client that shows one shows this. Escaped here. */
  title?: string
  /**
   * The hidden line a client previews beside the subject. Escaped here.
   * Omitted entirely when absent, so the client falls back to the first
   * visible text rather than an empty block.
   */
  preheader?: string
  /** Card markup the builder already escaped. Inserted verbatim. */
  bodyHtml: string
  /** The footer sentence, plain text. Escaped here. */
  footer: string
  /** Extra footer markup the builder already escaped (an unsubscribe link). */
  footerHtml?: string
}

/**
 * The media query, as one string so the test can assert the breakpoint the
 * document declares is the one this module names.
 */
export function emailMediaQuery(): string {
  return [
    `@media only screen and (max-width:${EMAIL_MOBILE_BREAKPOINT_PX}px){`,
    '.ke-wrap{padding:12px 6px!important}',
    '.ke-container{width:100%!important;max-width:100%!important}',
    '.ke-card{padding:16px!important;border-radius:10px!important}',
    '.ke-brand{font-size:18px!important}',
    '.ke-btn{display:block!important;width:auto!important}',
    '}',
  ].join('')
}

export function renderEmailDocument(input: EmailDocumentInput): string {
  const site = input.siteName ?? 'KenyonExpress'
  const title = input.title ?? site
  const preheader = input.preheader?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(input.preheader.trim())}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>${escapeHtml(title)}</title>
<style>${emailMediaQuery()}</style>
</head>
<body dir="rtl" style="margin:0;padding:0;background:${PANEL_WARM};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" class="ke-wrap" style="width:100%;background:${PANEL_WARM};padding:24px 12px;border-collapse:collapse">
<tr><td align="center" style="padding:0">
<table role="presentation" width="${EMAIL_MAX_WIDTH_PX}" cellpadding="0" cellspacing="0" border="0" dir="rtl" class="ke-container" style="width:100%;max-width:${EMAIL_MAX_WIDTH_PX}px;${RTL_ISOLATE_STYLE};text-align:right;font-family:${EMAIL_FONT_STACK};border-collapse:collapse">
<tr><td class="ke-brand" style="font-size:20px;font-weight:800;color:${INK};padding:0 0 16px;text-align:right">${escapeHtml(site)}</td></tr>
<tr><td style="padding:0">${input.bodyHtml}</td></tr>
<tr><td style="font-size:12px;color:${MUTED};padding:18px 0 0;text-align:center">${escapeHtml(input.footer)}${input.footerHtml ?? ''}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
