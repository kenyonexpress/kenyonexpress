import { describe, expect, it } from 'vitest'
import {
  LAYER_TEXT_OVERRIDES,
  REV_BREAKPOINTS,
  parseDataDim,
  parseDataText,
  parseDataXy,
  revBreakpointIndex,
} from './revslider-authored'

/**
 * The RevSlider attribute grammar: `key:v0,v1,v2,v3;key2:v` where the comma
 * list is one value per breakpoint (desktop first) and a single value applies
 * to every breakpoint. A mis-parse here moves or resizes every hero layer at
 * once, so the parser is pinned value by value.
 */

describe('revBreakpointIndex', () => {
  it('maps a width to the four RevSlider breakpoints, desktop first', () => {
    expect(REV_BREAKPOINTS).toEqual([1240, 1024, 778, 480])
    expect(revBreakpointIndex(1440)).toBe(0)
    expect(revBreakpointIndex(1240)).toBe(0)
    expect(revBreakpointIndex(1239)).toBe(1)
    expect(revBreakpointIndex(1024)).toBe(1)
    expect(revBreakpointIndex(1023)).toBe(2)
    expect(revBreakpointIndex(778)).toBe(2)
    expect(revBreakpointIndex(777)).toBe(3)
    expect(revBreakpointIndex(380)).toBe(3)
    expect(revBreakpointIndex(0)).toBe(3)
  })

  it('reads window.innerWidth when no width is given', () => {
    // jsdom reports 1024 by default, which sits on the second breakpoint.
    expect(revBreakpointIndex()).toBe(revBreakpointIndex(window.innerWidth))
  })
})

describe('parseDataText', () => {
  it('picks the value for the breakpoint and appends px', () => {
    const raw = 's:60,50,40,30;l:70,60,50,40;fw:700;ls:0'
    expect(parseDataText(raw, 0)).toEqual({
      fontSize: '60px',
      lineHeight: '70px',
      fontWeight: '700',
      letterSpacing: undefined,
    })
    expect(parseDataText(raw, 3)).toEqual({
      fontSize: '30px',
      lineHeight: '40px',
      fontWeight: '700',
      letterSpacing: undefined,
    })
  })

  it('falls back to the first value when the list is shorter than the breakpoint', () => {
    expect(parseDataText('s:48;l:56', 3)).toEqual({
      fontSize: '48px',
      lineHeight: '56px',
      fontWeight: undefined,
      letterSpacing: undefined,
    })
  })

  it('keeps a non-zero letter-spacing and drops 0 and 0px', () => {
    expect(parseDataText('ls:2px', 0).letterSpacing).toBe('2px')
    expect(parseDataText('ls:0px', 0).letterSpacing).toBeUndefined()
    expect(parseDataText('ls:0,1px', 1).letterSpacing).toBe('1px')
  })

  it('returns nothing for a null or malformed attribute', () => {
    expect(parseDataText(null, 0)).toEqual({
      fontSize: undefined,
      lineHeight: undefined,
      fontWeight: undefined,
      letterSpacing: undefined,
    })
    // A part with no colon and a part with an empty key are both skipped.
    expect(parseDataText('garbage;:5;s:12', 0).fontSize).toBe('12px')
  })

  it('trims whitespace around keys and values', () => {
    expect(parseDataText(' s : 20 , 18 ; fw : 400 ', 1)).toMatchObject({
      fontSize: '18px',
      fontWeight: '400',
    })
  })
})

describe('parseDataXy', () => {
  it('reads left from xo and top from yo for the breakpoint', () => {
    expect(parseDataXy('xo:100,80,60,40;yo:20,18,16,14', 2)).toEqual({ left: '60', top: '16' })
  })

  it('centres vertically when y is m', () => {
    expect(parseDataXy('xo:0;yo:-30;y:m', 0)).toEqual({ left: '0', top: 'calc(50% + -30)' })
    expect(parseDataXy('yo:12px;y:m,t', 1)).toEqual({ top: '12px' })
  })

  it('omits a side that is not authored', () => {
    expect(parseDataXy('xo:10', 0)).toEqual({ left: '10' })
    expect(parseDataXy('yo:10', 0)).toEqual({ top: '10' })
    expect(parseDataXy(null, 0)).toEqual({})
  })
})

describe('parseDataDim', () => {
  it('reads width and height for the breakpoint', () => {
    expect(parseDataDim('w:500,400,300,200;h:auto', 1)).toEqual({ width: '400', height: 'auto' })
  })

  it('reports undefined for an empty or missing dimension', () => {
    expect(parseDataDim('w:;h:', 0)).toEqual({ width: undefined, height: undefined })
    expect(parseDataDim(null, 0)).toEqual({ width: undefined, height: undefined })
  })
})

describe('LAYER_TEXT_OVERRIDES', () => {
  it('re-exports the live slide overrides as a string map', () => {
    for (const [key, value] of Object.entries(LAYER_TEXT_OVERRIDES)) {
      expect(typeof key).toBe('string')
      expect(typeof value).toBe('string')
    }
  })
})
