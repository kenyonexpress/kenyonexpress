'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { deleteAddress, saveAddress, setDefaultAddress } from '@/server/actions/account'
import type { AccountAddress } from '@/server/queries/account'
import { useActionState, useCallback, useEffect, useState } from 'react'

const INITIAL: AccountActionState = null

function Feedback({ state }: { state: AccountActionState }) {
  if (!state) return null
  if ('error' in state)
    return (
      <p className="account-alert account-alert--error" role="alert">
        {state.error}
      </p>
    )
  return <output className="account-alert account-alert--success">{state.success}</output>
}

function AddressForm({
  address,
  onDone,
}: {
  address: AccountAddress | null
  onDone: () => void
}) {
  const [state, action, pending] = useActionState(saveAddress, INITIAL)

  // Close the form only once the server confirmed the write. This has to be an
  // effect: calling onDone during render would fire on every subsequent render
  // while the state is still `success`.
  const succeeded = state !== null && 'success' in state
  useEffect(() => {
    if (succeeded) onDone()
  }, [succeeded, onDone])

  return (
    <form action={action} className="account-form">
      <Feedback state={state} />
      {address && <input type="hidden" name="id" value={address.id} />}

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_full_name">
            שם מלא
          </label>
          <input
            className="account-field__input"
            id="a_full_name"
            name="full_name"
            defaultValue={address?.fullName ?? ''}
            required
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_phone">
            טלפון
          </label>
          <input
            className="account-field__input"
            id="a_phone"
            name="phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            defaultValue={address?.phone ?? ''}
            required
          />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_street">
            רחוב
          </label>
          <input
            className="account-field__input"
            id="a_street"
            name="street"
            defaultValue={address?.street ?? ''}
            required
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_street_number">
            מספר
          </label>
          <input
            className="account-field__input"
            id="a_street_number"
            name="street_number"
            defaultValue={address?.streetNumber ?? ''}
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_city">
            עיר
          </label>
          <input
            className="account-field__input"
            id="a_city"
            name="city"
            defaultValue={address?.city ?? ''}
            required
          />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_apartment">
            דירה
          </label>
          <input
            className="account-field__input"
            id="a_apartment"
            name="apartment"
            defaultValue={address?.apartment ?? ''}
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_entrance">
            כניסה
          </label>
          <input
            className="account-field__input"
            id="a_entrance"
            name="entrance"
            defaultValue={address?.entrance ?? ''}
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_floor">
            קומה
          </label>
          <input
            className="account-field__input"
            id="a_floor"
            name="floor"
            defaultValue={address?.floor ?? ''}
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_zip">
            מיקוד
          </label>
          <input
            className="account-field__input"
            id="a_zip"
            name="zip"
            defaultValue={address?.zip ?? ''}
          />
        </div>
      </div>

      <div className="account-field">
        <label className="account-field__label" htmlFor="a_notes">
          הערות לשליח
        </label>
        <input
          className="account-field__input"
          id="a_notes"
          name="notes_for_courier"
          defaultValue={address?.notesForCourier ?? ''}
        />
      </div>

      <div className="account-field account-field--check">
        <input
          type="checkbox"
          id="a_default"
          name="is_default"
          defaultChecked={address?.isDefault ?? false}
        />
        <label htmlFor="a_default">קביעה ככתובת ברירת המחדל</label>
      </div>

      <div className="account-row__actions">
        <button className="account-btn account-btn--primary" type="submit" disabled={pending}>
          {pending ? 'שומר...' : 'שמירה'}
        </button>
        <button className="account-btn" type="button" onClick={onDone} disabled={pending}>
          ביטול
        </button>
      </div>
    </form>
  )
}

function AddressRow({ address }: { address: AccountAddress }) {
  const [deleteState, deleteActionFn, deletePending] = useActionState(deleteAddress, INITIAL)
  const [defaultState, defaultActionFn, defaultPending] = useActionState(setDefaultAddress, INITIAL)

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title">
          {address.street} {address.streetNumber ?? ''}, {address.city}{' '}
          {address.isDefault && (
            <span className="account-chip account-chip--default">ברירת מחדל</span>
          )}
        </p>
        <p className="account-row__meta">
          {address.fullName} · {address.phone}
          {address.apartment ? ` · דירה ${address.apartment}` : ''}
          {address.floor ? ` · קומה ${address.floor}` : ''}
        </p>
        <Feedback state={deleteState} />
        <Feedback state={defaultState} />
      </div>
      <div className="account-row__actions">
        {!address.isDefault && (
          <form action={defaultActionFn}>
            <input type="hidden" name="id" value={address.id} />
            <button className="account-btn" type="submit" disabled={defaultPending}>
              קביעה כברירת מחדל
            </button>
          </form>
        )}
        <form action={deleteActionFn}>
          <input type="hidden" name="id" value={address.id} />
          <button
            className="account-btn account-btn--danger"
            type="submit"
            disabled={deletePending}
          >
            מחיקה
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AddressManager({ addresses }: { addresses: AccountAddress[] }) {
  const [editing, setEditing] = useState<'new' | null>(null)
  // Stable identity so the form's close effect does not refire on every render.
  const closeForm = useCallback(() => setEditing(null), [])

  return (
    <>
      <section className="account-card">
        <div className="account-row" style={{ paddingTop: 0 }}>
          <div className="account-row__main">
            <h2 className="account-card__title" style={{ marginBottom: 0 }}>
              הכתובות שלי
            </h2>
          </div>
          <div className="account-row__actions">
            <button
              className="account-btn account-btn--primary"
              type="button"
              onClick={() => setEditing(editing === 'new' ? null : 'new')}
            >
              {editing === 'new' ? 'סגירה' : 'הוספת כתובת'}
            </button>
          </div>
        </div>

        {editing === 'new' && (
          <div style={{ paddingTop: 16 }}>
            <AddressForm address={null} onDone={closeForm} />
          </div>
        )}
      </section>

      <section className="account-card">
        {addresses.length === 0 ? (
          <p className="account-empty">עדיין לא הוספת כתובת.</p>
        ) : (
          addresses.map((address) => <AddressRow key={address.id} address={address} />)
        )}
      </section>
    </>
  )
}
