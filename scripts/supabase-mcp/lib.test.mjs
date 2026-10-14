import { describe, expect, it } from 'vitest'
import { encodeMessage, splitFrames } from './lib.mjs'

describe('encodeMessage', () => {
  it('is one JSON document terminated by a newline', () => {
    const wire = encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    expect(wire.endsWith('\n')).toBe(true)
    expect(wire.slice(0, -1).includes('\n')).toBe(false)
    expect(JSON.parse(wire)).toEqual({ jsonrpc: '2.0', id: 1, method: 'initialize' })
  })
})

describe('splitFrames', () => {
  it('parses complete lines and keeps the unterminated tail', () => {
    const { frames, rest } = splitFrames('{"id":1}\n{"id":2}\n{"id":3')
    expect(frames).toEqual([{ id: 1 }, { id: 2 }])
    expect(rest).toBe('{"id":3')
  })

  it('skips blank lines and non-JSON log lines without throwing', () => {
    const { frames, rest } = splitFrames('starting server\n\n{"id":9,"result":{}}\n')
    expect(frames).toEqual([{ id: 9, result: {} }])
    expect(rest).toBe('')
  })

  it('an empty buffer yields nothing', () => {
    expect(splitFrames('')).toEqual({ frames: [], rest: '' })
  })
})
