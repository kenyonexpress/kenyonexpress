import { describe, expect, it } from 'vitest'
import {
  REGISTER_STEPS,
  detailsIssues,
  firstNameOf,
  phoneStepIssues,
  stepAnnouncement,
  stepForField,
  stepIndex,
  stepStates,
} from './register-steps'
import { TERMS_NOT_ACCEPTED } from './terms-acceptance'

describe('register steps (UX24)', () => {
  it('has four steps in order, with a stable index', () => {
    expect(REGISTER_STEPS).toEqual(['details', 'phone', 'verify', 'welcome'])
    expect(stepIndex('details')).toBe(0)
    expect(stepIndex('welcome')).toBe(3)
  })

  it('marks the steps before the current one done and the ones after upcoming', () => {
    expect(stepStates('phone', false)).toEqual({
      details: 'done',
      phone: 'current',
      verify: 'upcoming',
      welcome: 'upcoming',
    })
  })

  it('marks the code step skipped at the welcome when no code was typed', () => {
    expect(stepStates('welcome', true)).toEqual({
      details: 'done',
      phone: 'done',
      verify: 'skipped',
      welcome: 'current',
    })
    expect(stepStates('welcome', false).verify).toBe('done')
  })

  it('announces the step as N of 4 with its label', () => {
    expect(stepAnnouncement('details')).toBe('שלב 1 מתוך 4: פרטים')
    expect(stepAnnouncement('verify')).toBe('שלב 3 מתוך 4: אימות הטלפון')
  })

  it('sends a server field error back to the step that holds the field', () => {
    expect(stepForField('full_name')).toBe('details')
    expect(stepForField('email')).toBe('details')
    expect(stepForField('password')).toBe('details')
    expect(stepForField('phone')).toBe('phone')
    expect(stepForField('accept_terms')).toBe('phone')
    expect(stepForField(undefined)).toBe('phone')
  })

  it('refuses step one with the server’s own sentences, one per field', () => {
    expect(detailsIssues({ full_name: ' a ', email: 'nope', password: 'short' })).toEqual({
      full_name: 'שם מלא חייב להכיל לפחות 2 תווים',
      email: 'כתובת אימייל לא תקינה',
      password: 'הסיסמה חייבת להכיל לפחות 8 תווים',
    })
    expect(
      detailsIssues({ full_name: 'דנה כהן', email: 'd@x.co', password: 'longenough' }),
    ).toEqual({ password: 'הסיסמה חייבת להכיל לפחות ספרה אחת' })
    expect(detailsIssues({ full_name: 'דנה כהן', email: 'd@x.co', password: 'secret12' })).toEqual(
      {},
    )
  })

  it('refuses step two on a non-Israeli number and on an unticked terms box', () => {
    expect(phoneStepIssues({ phone: '12345', accept_terms: true })).toEqual({
      phone: 'מספר טלפון ישראלי לא תקין (לדוגמה: 050-1234567)',
    })
    expect(phoneStepIssues({ phone: '050-1234567', accept_terms: false })).toEqual({
      accept_terms: TERMS_NOT_ACCEPTED,
    })
    expect(phoneStepIssues({ phone: '050-1234567', accept_terms: true })).toEqual({})
  })

  it('takes the given name for the welcome line', () => {
    expect(firstNameOf('  דנה   כהן ')).toBe('דנה')
    expect(firstNameOf('')).toBe('')
  })
})
