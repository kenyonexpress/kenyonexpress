import { describe, expect, it } from 'vitest'
import { MIN_IMAGE_WIDTH, validateImageDimensions } from './validate'

describe('validateImageDimensions', () => {
  it('accepts a catalogue-worthy photo', () => {
    expect(validateImageDimensions(1200, 900)).toBeNull()
    expect(validateImageDimensions(MIN_IMAGE_WIDTH, MIN_IMAGE_WIDTH)).toBeNull()
  })

  it('refuses under-width originals with the width in the message', () => {
    expect(validateImageDimensions(400, 400)).toContain('400px')
  })

  it('refuses banner slivers and towers, accepts the 1:2..2:1 band edges', () => {
    expect(validateImageDimensions(1600, 300)).not.toBeNull()
    expect(validateImageDimensions(800, 3000)).not.toBeNull()
    expect(validateImageDimensions(1000, 500)).toBeNull()
    expect(validateImageDimensions(1000, 2000)).toBeNull()
  })
})
