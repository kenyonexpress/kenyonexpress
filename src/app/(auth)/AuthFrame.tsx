import { t } from '@/lib/i18n/messages'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Electro v7's my-account page (V04): breadcrumb, a centred "החשבון שלי", then
 * WooCommerce's two columns, the form on the reading side and `aside` across
 * an "או" disc. Without `aside` the form stands alone at one column's width,
 * which is what forgot/reset password and the MFA steps use.
 *
 * Server-rendered and static on purpose: the forms inside are client islands,
 * and nothing here reads the request.
 */
export default function AuthFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="auth-page" dir="rtl">
      <nav className="auth-page__breadcrumb" aria-label={t('auth.frame.crumbLabel')}>
        <Link href="/">{t('auth.frame.crumbHome')}</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{t('auth.frame.title')}</span>
      </nav>
      <h1 className="auth-page__title">{t('auth.frame.title')}</h1>
      {aside ? (
        <div className="auth-cols">
          <section className="auth-col">{children}</section>
          <div className="auth-cols__or" aria-hidden="true">
            <span>{t('auth.frame.or')}</span>
          </div>
          <section className="auth-col auth-aside">{aside}</section>
        </div>
      ) : (
        <div className="auth-page__single">{children}</div>
      )}
    </div>
  )
}

/** A column heading with Electro's yellow bar under the words. */
export function AuthHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="auth-col__heading">
      <span>{children}</span>
    </h2>
  )
}

/**
 * The panel opposite the form: who the other door is for, what an account
 * gets you, and one button through it. On /login it points at /register, on
 * /register at /login, and it carries `next` across so the detour does not
 * lose the page the shopper was sent from.
 */
export function AuthAside({ mode, next }: { mode: 'toRegister' | 'toLogin'; next?: string }) {
  const toRegister = mode === 'toRegister'
  const base = toRegister ? '/register' : '/login'
  const href = next ? `${base}?next=${encodeURIComponent(next)}` : base
  return (
    <>
      <AuthHeading>
        {toRegister ? t('auth.aside.newHeading') : t('auth.aside.returningHeading')}
      </AuthHeading>
      <p className="auth-col__lead">
        {toRegister ? t('auth.aside.newLead') : t('auth.aside.returningLead')}
      </p>
      <ul className="auth-benefits">
        <li>{t('auth.aside.benefitCheckout')}</li>
        <li>{t('auth.aside.benefitOrders')}</li>
        <li>{t('auth.aside.benefitVouchers')}</li>
      </ul>
      <Link href={href} className="auth-btn auth-btn--primary">
        {toRegister ? t('auth.aside.newCta') : t('auth.aside.returningCta')}
      </Link>
    </>
  )
}
