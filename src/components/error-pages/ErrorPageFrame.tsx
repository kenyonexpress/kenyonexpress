import { DEFAULT_CONTACT_EMAIL } from '@/lib/contact-address'
import { t } from '@/lib/i18n/messages'
import { PUBLISHED_STORE_WHATSAPP, waChatLink } from '@/lib/whatsapp'
import type { ReactNode } from 'react'
import '@/styles/error-pages.css'

/**
 * The one frame behind the 404, the 500 and the offline page (G7, 05.11.2026).
 *
 * No hooks, no data, no imports from the storefront chrome: these documents
 * render when the layout threw or the network is gone, so everything they
 * need is in this file, its stylesheet and the logo in /public. The palette
 * is the sheet's own copy of Electro's values (see error-pages.css), never
 * the frozen globals.
 *
 * Support is two links: the support address and the store's WhatsApp number,
 * the published one so the link works even when the env that overrides it is
 * not loaded (which, on an error page, it may not be).
 */
export default function ErrorPageFrame({
  code,
  title,
  text,
  actions,
  children,
}: {
  code?: string
  title: string
  text: string
  actions: ReactNode
  children?: ReactNode
}) {
  const whatsapp =
    waChatLink(PUBLISHED_STORE_WHATSAPP) ?? `https://wa.me/${PUBLISHED_STORE_WHATSAPP}`
  return (
    <main dir="rtl" className="ke-error-page">
      {/* A plain <img>: next/image needs the optimizer route, which is one of
          the things that can be down when this page shows. */}
      <img
        src="/images/logo.webp"
        alt={t('errorPages.logoAlt')}
        width={380}
        height={100}
        className="ke-error-page__logo"
      />
      {code && (
        <p className="ke-error-page__code" aria-hidden="true">
          {code}
        </p>
      )}
      <h1 className="ke-error-page__title">{title}</h1>
      <p className="ke-error-page__text">{text}</p>
      <div className="ke-error-page__actions">{actions}</div>
      {children}
      <p className="ke-error-page__support">
        {t('errorPages.supportLead')}{' '}
        <a href={`mailto:${DEFAULT_CONTACT_EMAIL}`}>{t('errorPages.supportEmail')}</a>
        {' · '}
        <a href={whatsapp} rel="noreferrer noopener" target="_blank">
          {t('errorPages.supportWhatsApp')}
        </a>
      </p>
    </main>
  )
}
