/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const variant = vi.hoisted(() => ({ value: 'control' }))
vi.mock('@/lib/analytics/use-experiment-variant', () => ({
  useExperimentVariant: () => variant.value,
}))

import BenefitBarExperiment from './BenefitBarExperiment'

beforeEach(() => {
  variant.value = 'control'
})

describe('BenefitBarExperiment', () => {
  it('renders the strip untouched in control and in the static_hero arm', () => {
    for (const arm of ['control', 'static_hero']) {
      variant.value = arm
      const { container, unmount } = render(
        <BenefitBarExperiment>
          <section data-testid="bar">strip</section>
        </BenefitBarExperiment>,
      )
      expect(container.querySelector('[data-testid="bar"]'), arm).not.toBeNull()
      unmount()
    }
  })

  it('unmounts the strip in the no_benefit_bar arm', () => {
    variant.value = 'no_benefit_bar'
    const { container } = render(
      <BenefitBarExperiment>
        <section data-testid="bar">strip</section>
      </BenefitBarExperiment>,
    )
    expect(container.querySelector('[data-testid="bar"]')).toBeNull()
    expect(container.innerHTML).toBe('')
  })
})
