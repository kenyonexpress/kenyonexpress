'use client'

import { PhoneInput } from '@/components/ui/PhoneInput'
import {
  type AddressBookActionState,
  deleteAddressBook,
  saveAddressBook,
  setDefaultAddressBook,
} from '@/server/actions/address-book'
import type { AddressBookEntry } from '@/server/queries/account'
import { useActionState, useCallback, useEffect, useState } from 'react'

const INITIAL: AddressBookActionState = null

function Feedback({ state }: { state: AddressBookActionState }) {
  if (!state) return null
  if ('error' in state)
    return (
      <p className="account-alert account-alert--error" role="alert">
        {state.error}
      </p>
    )
  return <output className="account-alert account-alert--success">{state.success}</output>
}

function AddressBookForm({
  address,
  onDone,
}: {
  address: AddressBookEntry | null
  onDone: () => void
}) {
  const [state, action, pending] = useActionState(saveAddressBook, INITIAL)
  const [phone, setPhone] = useState(address?.phone ?? '')

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
          <label className="account-field__label" htmlFor="ab_label">
            תווית (למשל: בית, עבודה)
          </label>
          <input
            className="account-field__input"
            id="ab_label"
            name="label"
            defaultValue={address?.label ?? ''}
            placeholder="בית"
            required
          />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_full_name">
            שם מלא
          </label>
          <input
            className="account-field__input"
            id="ab_full_name"
            name="full_name"
            defaultValue={address?.fullName ?? ''}
            required
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_phone">
            טלפון
          </label>
          <PhoneInput
            className="account-field__input"
            id="ab_phone"
            name="phone"
            value={phone}
            onChange={setPhone}
            required
          />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_street">
            כתובת
          </label>
          <input
            className="account-field__input"
            id="ab_street"
            name="street"
            defaultValue={address?.street ?? ''}
            required
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_city">
            עיר
          </label>
          <input
            className="account-field__input"
            id="ab_city"
            name="city"
            defaultValue={address?.city ?? ''}
            required
          />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_postal_code">
            מיקוד (אופציונלי)
          </label>
          <input
            className="account-field__input"
            id="ab_postal_code"
            name="postal_code"
            defaultValue={address?.postalCode ?? ''}
          />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="ab_country">
            מדינה
          </label>
          <select
            className="account-field__input"
            id="ab_country"
            name="country"
            defaultValue={address?.country ?? 'IL'}
          >
            <option value="IL">ישראל</option>
          </select>
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__checkbox">
            <input type="checkbox" name="is_default" defaultChecked={address?.isDefault ?? false} />
            <span>קבע ככתובת ברירת מחדל</span>
          </label>
        </div>
      </div>

      <div className="account-form__actions">
        <button type="submit" className="account-btn account-btn--primary" disabled={pending}>
          {pending ? 'שומר...' : address ? 'עדכן' : 'הוסף'}
        </button>
        <button
          type="button"
          className="account-btn account-btn--secondary"
          onClick={onDone}
          disabled={pending}
        >
          ביטול
        </button>
      </div>
    </form>
  )
}

function AddressBookCard({
  address,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  address: AddressBookEntry
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  return (
    <div className="account-card">
      <div className="account-card__header">
        <h3 className="account-card__title">
          {address.label}
          {address.isDefault && (
            <span className="account-badge account-badge--success">ברירת מחדל</span>
          )}
        </h3>
      </div>
      <div className="account-card__body">
        <p className="account-card__text">
          <strong>{address.fullName}</strong>
        </p>
        <p className="account-card__text">{address.street}</p>
        <p className="account-card__text">
          {address.city}
          {address.postalCode && `, ${address.postalCode}`}
        </p>
        <p className="account-card__text" dir="ltr">
          {address.phone}
        </p>
      </div>
      <div className="account-card__actions">
        <button type="button" className="account-btn account-btn--small" onClick={onEdit}>
          ערוך
        </button>
        {!address.isDefault && (
          <button type="button" className="account-btn account-btn--small" onClick={onSetDefault}>
            קבע כברירת מחדל
          </button>
        )}
        <button
          type="button"
          className="account-btn account-btn--small account-btn--danger"
          onClick={onDelete}
        >
          מחק
        </button>
      </div>
    </div>
  )
}

export default function AddressBookManager({ addresses }: { addresses: AddressBookEntry[] }) {
  const [editing, setEditing] = useState<AddressBookEntry | null | 'new'>(null)
  const [deleteState, deleteAction] = useActionState(deleteAddressBook, INITIAL)
  const [setDefaultState, setDefaultAction] = useActionState(setDefaultAddressBook, INITIAL)

  const handleEdit = useCallback((address: AddressBookEntry | null) => {
    setEditing(address ?? 'new')
  }, [])

  const handleDone = useCallback(() => {
    setEditing(null)
  }, [])

  const handleDelete = useCallback(
    (addressId: string) => {
      if (!confirm('למחוק כתובת זו?')) return
      const formData = new FormData()
      formData.set('id', addressId)
      deleteAction(formData)
    },
    [deleteAction],
  )

  const handleSetDefault = useCallback(
    (addressId: string) => {
      const formData = new FormData()
      formData.set('id', addressId)
      setDefaultAction(formData)
    },
    [setDefaultAction],
  )

  if (editing) {
    const address = editing === 'new' ? null : editing
    return (
      <div className="account-section">
        <h2 className="account-section__title">{address ? 'עריכת כתובת' : 'כתובת חדשה'}</h2>
        <AddressBookForm address={address} onDone={handleDone} />
      </div>
    )
  }

  return (
    <div className="account-section">
      <Feedback state={deleteState} />
      <Feedback state={setDefaultState} />

      {addresses.length === 0 ? (
        <p className="account-empty">אין כתובות שמורות</p>
      ) : (
        <div className="account-grid">
          {addresses.map((address) => (
            <AddressBookCard
              key={address.id}
              address={address}
              onEdit={() => handleEdit(address)}
              onSetDefault={() => handleSetDefault(address.id)}
              onDelete={() => handleDelete(address.id)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="account-btn account-btn--primary"
        onClick={() => handleEdit(null)}
      >
        + הוסף כתובת חדשה
      </button>
    </div>
  )
}
