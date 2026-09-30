import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CityAutocomplete from './CityAutocomplete'

/**
 * The city combobox as a shopper meets it: typing opens a list, the list can
 * be walked with the keyboard, a pick lands the canonical name in the field,
 * and nothing about it stops a city the list does not know.
 */

function setup(props: Partial<Parameters<typeof CityAutocomplete>[0]> = {}) {
  const onPick = vi.fn()
  const onBlur = vi.fn()
  const utils = render(<CityAutocomplete id="city" onPick={onPick} onBlur={onBlur} {...props} />)
  const input = utils.container.querySelector<HTMLInputElement>('input[name="city"]')
  if (!input) throw new Error('city input missing')
  const list = () => utils.container.querySelector<HTMLDivElement>('[role="listbox"]')
  const options = () => [...utils.container.querySelectorAll<HTMLDivElement>('[role="option"]')]
  return { ...utils, input, list, options, onPick, onBlur }
}

describe('the city autocomplete', () => {
  it('is a combobox over an ordinary named input, so the form still posts `city`', () => {
    const { input } = setup({ defaultValue: 'חיפה' })
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.value).toBe('חיפה')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens on typing with the matching cities, and closes when nothing matches', () => {
    const { input, options, list } = setup()
    fireEvent.change(input, { target: { value: 'רמ' } })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(options().map((o) => o.textContent)).toContain('רמת גן')
    expect(list()?.hidden).toBe(false)

    fireEvent.change(input, { target: { value: 'רמזזז' } })
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(list()?.hidden).toBe(true)
  })

  it('picks with the mouse: the canonical name lands in the field and the parent is told', () => {
    const { input, options, onPick } = setup()
    fireEvent.change(input, { target: { value: 'פתח תקוה' } })
    const option = options()[0]
    expect(option?.textContent).toBe('פתח תקווה')
    if (!option) throw new Error('no option')
    fireEvent.mouseDown(option)
    expect(input.value).toBe('פתח תקווה')
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: 'פתח תקווה' }))
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('walks the list with the arrows and picks with Enter without submitting the form', () => {
    const submit = vi.fn((event: Event) => event.preventDefault())
    const { input, options, onPick, container } = setup()
    container.querySelector('input')?.closest('div')
    const form = document.createElement('form')
    form.addEventListener('submit', submit)
    document.body.appendChild(form)
    form.appendChild(container)

    fireEvent.change(input, { target: { value: 'רמ' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0]?.id)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true')

    const enter = fireEvent.keyDown(input, { key: 'Enter' })
    // Default prevented: Enter on a highlighted option is a pick, not a submit.
    expect(enter).toBe(false)
    expect(input.value).toBe('רמת גן')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(submit).not.toHaveBeenCalled()
    form.remove()
  })

  it('lets Enter through to the form when nothing is highlighted', () => {
    const { input, onPick } = setup()
    fireEvent.change(input, { target: { value: 'רמ' } })
    const enter = fireEvent.keyDown(input, { key: 'Enter' })
    expect(enter).toBe(true)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('closes on Escape and on blur, keeping what was typed', () => {
    const { input, onBlur } = setup()
    fireEvent.change(input, { target: { value: 'רמ' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.value).toBe('רמ')

    fireEvent.change(input, { target: { value: 'רמת' } })
    expect(input.getAttribute('aria-expanded')).toBe('true')
    fireEvent.blur(input)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('רמת')
  })

  it('accepts a locality it does not know: free text is a valid answer', () => {
    const { input, options, onPick, onBlur } = setup()
    fireEvent.change(input, { target: { value: 'מושב קטן' } })
    expect(options()).toHaveLength(0)
    fireEvent.blur(input)
    expect(input.value).toBe('מושב קטן')
    expect(onPick).not.toHaveBeenCalled()
    expect(onBlur).toHaveBeenCalled()
  })

  it('surfaces the invalid state and the error id it was handed', () => {
    const { input } = setup({ invalid: true, describedBy: 'co-err-city' })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('co-err-city')
  })

  it('stays uncontrolled: a value written to the DOM by the postal autofill survives a re-render', () => {
    const { input, rerender } = setup()
    input.value = 'תל אביב'
    rerender(<CityAutocomplete id="city" />)
    expect(input.value).toBe('תל אביב')
  })
})
