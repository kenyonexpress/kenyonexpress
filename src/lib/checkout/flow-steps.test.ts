import {
  CHECKOUT_FLOW_STEPS,
  FLOW_STEP_TITLES,
  type StepValues,
  firstFlowStepWithErrors,
  flowStepForField,
  flowStepState,
  initialFlowStep,
  nextFlowStep,
  previousFlowStep,
  sectionsOfFlowStep,
  validateAllSteps,
  validateFlowStep,
} from '@/lib/checkout/steps'
import { describe, expect, it } from 'vitest'

/**
 * The three-step flow over the four sections (UX17). What is pinned: a step
 * judges exactly the sections it is made of and nothing else; the three
 * steps together judge what the single submit judges; a saved address
 * switches the same sections off in both; and an error found by the submit
 * names the step that owns the field, earliest first.
 */

const COMPLETE: StepValues = {
  first_name: 'דנה',
  last_name: 'כהן',
  phone: '0501234567',
  email: 'dana@example.com',
  city: 'תל אביב',
  street: 'דיזנגוף',
  street_number: '100',
  accept_terms: 'on',
}

describe('the flow steps', () => {
  it('are three, in order, each with a Hebrew title', () => {
    expect(CHECKOUT_FLOW_STEPS).toEqual(['details', 'address', 'payment'])
    for (const step of CHECKOUT_FLOW_STEPS) {
      expect(FLOW_STEP_TITLES[step]).toMatch(/[֐-׿]/)
    }
  })

  it('cover the four sections exactly once between them', () => {
    const sections = CHECKOUT_FLOW_STEPS.flatMap((step) => [...sectionsOfFlowStep(step)])
    expect([...sections].sort()).toEqual(['address', 'confirm', 'details', 'review'])
  })

  it('walk forwards and back, and stop at the ends', () => {
    expect(nextFlowStep('details')).toBe('address')
    expect(nextFlowStep('address')).toBe('payment')
    expect(nextFlowStep('payment')).toBeNull()
    expect(previousFlowStep('payment')).toBe('address')
    expect(previousFlowStep('details')).toBeNull()
  })

  it('report done / current / upcoming relative to the open step', () => {
    expect(flowStepState('details', 'address')).toBe('done')
    expect(flowStepState('address', 'address')).toBe('current')
    expect(flowStepState('payment', 'address')).toBe('upcoming')
  })
})

describe('validateFlowStep', () => {
  it('judges only its own step: an empty address does not fail the details step', () => {
    const values: StepValues = { ...COMPLETE, city: '', street: '', street_number: '' }
    expect(validateFlowStep('details', values)).toEqual({})
    expect(Object.keys(validateFlowStep('address', values)).sort()).toEqual([
      'city',
      'street',
      'street_number',
    ])
  })

  it('judges the terms on the payment step and nothing else there', () => {
    expect(validateFlowStep('payment', { ...COMPLETE, accept_terms: undefined })).toEqual({
      accept_terms: 'יש לאשר את תנאי השימוש',
    })
    expect(validateFlowStep('payment', COMPLETE)).toEqual({})
  })

  it('is clear for a step a saved address answered, whatever the fields hold', () => {
    expect(validateFlowStep('details', {}, ['details', 'address'])).toEqual({})
    expect(validateFlowStep('address', {}, ['details', 'address'])).toEqual({})
    // The payment step is not answered by an address.
    expect(validateFlowStep('payment', {}, ['details', 'address'])).toHaveProperty('accept_terms')
  })

  it('agrees with the single submit: the three steps together find the same fields', () => {
    const values: StepValues = { email: 'not-an-email', zip: '12' }
    const together = Object.assign(
      {},
      ...CHECKOUT_FLOW_STEPS.map((step) => validateFlowStep(step, values)),
    )
    expect(together).toEqual(validateAllSteps(values))
  })
})

describe('where an error sends the shopper', () => {
  it('maps every form field to the step that renders it', () => {
    expect(flowStepForField('first_name')).toBe('details')
    expect(flowStepForField('email')).toBe('details')
    expect(flowStepForField('city')).toBe('address')
    expect(flowStepForField('zip')).toBe('address')
    expect(flowStepForField('order_notes')).toBe('address')
    expect(flowStepForField('accept_terms')).toBe('payment')
    // Unknown fields land where the submit button is.
    expect(flowStepForField('something_new')).toBe('payment')
  })

  it('names the earliest step with an error, in flow order and not object order', () => {
    expect(firstFlowStepWithErrors({ accept_terms: 'x', city: 'x' })).toBe('address')
    expect(firstFlowStepWithErrors({ accept_terms: 'x', city: 'x', phone: 'x' })).toBe('details')
    expect(firstFlowStepWithErrors({ accept_terms: 'x' })).toBe('payment')
    expect(firstFlowStepWithErrors({})).toBeNull()
  })
})

describe('the opening step', () => {
  it('is the first step for a guest', () => {
    expect(initialFlowStep([])).toBe('details')
  })

  it('is the address step for a saved address: the slot and the notes still live there', () => {
    expect(initialFlowStep(['details', 'address'])).toBe('address')
  })
})
