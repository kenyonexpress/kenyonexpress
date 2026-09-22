'use client'

import { t } from '@/lib/i18n/messages'
import type { AccountActionState } from '@/lib/validations/account'
import { saveInvoiceSettings } from '@/server/actions/account'
import { useActionState, useState } from 'react'

const INITIAL: AccountActionState = null

/**
 * "Invoice to business name" -- OWNER DECISIONS v2, 22.09.2026.
 *
 * Applies to FUTURE invoices only: `src/server/payments/invoices.ts` reads
 * this row at document-build time, and an already-issued document is never
 * rewritten. Both fields are required together when the toggle is on
 * (`invoiceSettingsSchema`), because a business invoice with a name and no
 * registration number is not one a business can use.
 */
export default function BusinessInvoiceSettings({
  invoiceToBusiness,
  businessName,
  businessRegistrationNumber,
}: {
  invoiceToBusiness: boolean
  businessName: string | null
  businessRegistrationNumber: string | null
}) {
  const [state, action, pending] = useActionState(saveInvoiceSettings, INITIAL)
  const [checked, setChecked] = useState(invoiceToBusiness)

  return (
    <section className="account-card">
      <h2 className="account-card__title">{t('account.businessInvoiceTitle')}</h2>
      <p className="account-row__meta">{t('account.businessInvoiceIntro')}</p>

      <form action={action} className="account-form">
        {state && 'error' in state && (
          <p className="account-alert account-alert--error" role="alert">
            {state.error}
          </p>
        )}
        {state && 'success' in state && (
          <output className="account-alert account-alert--success">{state.success}</output>
        )}

        <label
          className="account-field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <input
            type="checkbox"
            name="invoice_to_business"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="h-5 w-5"
          />
          <span className="account-field__label">{t('account.businessInvoiceToggle')}</span>
        </label>

        {checked && (
          <div className="account-form__row">
            <div className="account-field">
              <label className="account-field__label" htmlFor="business_name">
                {t('account.businessInvoiceName')}
              </label>
              <input
                className="account-field__input"
                id="business_name"
                name="business_name"
                defaultValue={businessName ?? ''}
                maxLength={120}
                required
              />
            </div>

            <div className="account-field">
              <label className="account-field__label" htmlFor="business_registration_number">
                {t('account.businessInvoiceRegistrationNumber')}
              </label>
              <input
                className="account-field__input"
                id="business_registration_number"
                name="business_registration_number"
                dir="ltr"
                inputMode="numeric"
                defaultValue={businessRegistrationNumber ?? ''}
                maxLength={9}
                placeholder="123456789"
                required
              />
            </div>
          </div>
        )}

        <button className="account-btn" type="submit" disabled={pending}>
          {pending ? t('account.businessInvoiceSaving') : t('account.businessInvoiceSave')}
        </button>
      </form>
    </section>
  )
}
