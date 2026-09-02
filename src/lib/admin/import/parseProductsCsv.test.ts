import { crc32, deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseProductsCsv } from './parseProductsCsv'

// ── Minimal xlsx builder ─────────────────────────────────────────────────────
// Builds a real zip (local headers, central directory, EOCD) so the parser is
// tested against genuine workbook bytes, not a mock of its own internals.

function zipBuffer(files: Array<[string, string]>, { deflate = false } = {}): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const [name, content] of files) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const raw = Buffer.from(content, 'utf8')
    const data = deflate ? deflateRawSync(raw) : raw
    const method = deflate ? 8 : 0
    const checksum = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    locals.push(local, nameBuffer, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuffer)

    offset += 30 + nameBuffer.length + data.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, ...centrals, eocd])
}

function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

type Cell = string | number | null

/**
 * Rows are positional: index 0 renders as sheet row 1. A null row is omitted
 * from the XML entirely, the way Excel drops blank rows, so the r-attribute
 * gap handling gets exercised.
 */
function xlsxBuffer(
  rows: Array<Cell[] | null>,
  { deflate = false, inlineStrings = false } = {},
): Buffer {
  const shared: string[] = []
  const sharedIndex = (text: string) => {
    const existing = shared.indexOf(text)
    if (existing !== -1) return existing
    shared.push(text)
    return shared.length - 1
  }

  const rowsXml = rows
    .map((cells, rowIdx) => {
      if (cells === null) return ''
      const cellsXml = cells
        .map((cell, colIdx) => {
          if (cell === null) return ''
          const ref = `${columnLetter(colIdx)}${rowIdx + 1}`
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`
          if (inlineStrings) {
            return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`
          }
          return `<c r="${ref}" t="s"><v>${sharedIndex(cell)}</v></c>`
        })
        .join('')
      return `<row r="${rowIdx + 1}">${cellsXml}</row>`
    })
    .join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared
    .map((text) => `<si><t>${escapeXml(text)}</t></si>`)
    .join('')}</sst>`

  return zipBuffer(
    [
      ['xl/sharedStrings.xml', sharedXml],
      ['xl/worksheets/sheet1.xml', sheet],
    ],
    { deflate },
  )
}

const HEADER = 'slug,name_he,type,name_en,kenyon_price,full_price,platform_percent'

// ── CSV ──────────────────────────────────────────────────────────────────────

describe('parseProductsCsv – CSV input', () => {
  it('parses valid rows into typed records with coerced numbers', () => {
    const result = parseProductsCsv(
      Buffer.from(`${HEADER}\nmouse-pro,עכבר מקצועי,physical,Pro Mouse,149.9,199,12.5\n`),
    )
    expect(result.errors).toEqual([])
    expect(result.totalDataRows).toBe(1)
    expect(result.rows).toEqual([
      {
        slug: 'mouse-pro',
        name_he: 'עכבר מקצועי',
        type: 'physical',
        name_en: 'Pro Mouse',
        description_he: null,
        kenyon_price: 149.9,
        full_price: 199,
        platform_percent: 12.5,
      },
    ])
  })

  it('handles quoted fields: commas, escaped quotes, embedded newlines', () => {
    const csv = `slug,name_he,type,description_he\ngift-card,"שובר ""מתנה""",coupon,"שורה ראשונה\nשורה, שנייה"\n`
    const result = parseProductsCsv(Buffer.from(csv))
    expect(result.errors).toEqual([])
    expect(result.rows[0]?.name_he).toBe('שובר "מתנה"')
    expect(result.rows[0]?.description_he).toBe('שורה ראשונה\nשורה, שנייה')
  })

  it('strips a UTF-8 BOM and accepts CRLF line endings', () => {
    const csv = '\ufeffslug,name_he,type\r\nheadset-x,אוזניות איקס,physical\r\n'
    const result = parseProductsCsv(Buffer.from(csv))
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.slug).toBe('headset-x')
  })

  it('reports each invalid row by its physical row number and keeps valid rows', () => {
    const csv = [
      HEADER,
      'good-one,מוצר תקין,physical,,,,',
      'BAD SLUG,מוצר,physical,,,,',
      'good-two,מוצר נוסף,coupon,,,,',
      'neg-price,מוצר שלישי,physical,,-5,,',
    ].join('\n')
    const result = parseProductsCsv(Buffer.from(csv))
    expect(result.totalDataRows).toBe(4)
    expect(result.rows.map((row) => row.slug)).toEqual(['good-one', 'good-two'])
    expect(result.errors).toEqual([
      { row: 3, column: 'slug', message: 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד' },
      { row: 5, column: 'kenyon_price', message: 'מחיר לא יכול להיות שלילי' },
    ])
  })

  it('collects multiple errors on the same row', () => {
    const csv = `${HEADER}\nx,,notatype,,abc,,150\n`
    const result = parseProductsCsv(Buffer.from(csv))
    expect(result.rows).toEqual([])
    const columns = result.errors.filter((e) => e.row === 2).map((e) => e.column)
    expect(columns).toEqual(
      expect.arrayContaining(['slug', 'name_he', 'type', 'kenyon_price', 'platform_percent']),
    )
    expect(result.errors.find((e) => e.column === 'type')?.message).toBe(
      'סוג מוצר חייב להיות physical, coupon או recurring',
    )
  })

  it('fails the whole file when a required column is missing', () => {
    const result = parseProductsCsv(Buffer.from('slug,name_en\nabc,Thing\n'))
    expect(result.rows).toEqual([])
    expect(result.totalDataRows).toBe(0)
    expect(result.errors).toEqual([
      { row: 0, column: null, message: 'חסרות עמודות חובה: name_he, type' },
    ])
  })

  it('rejects an empty buffer and a whitespace-only file at file level', () => {
    expect(parseProductsCsv(Buffer.alloc(0)).errors).toEqual([
      { row: 0, column: null, message: 'הקובץ ריק' },
    ])
    expect(parseProductsCsv(Buffer.from('\n\n,\n')).errors).toEqual([
      { row: 0, column: null, message: 'הקובץ ריק' },
    ])
  })

  it('skips blank lines without counting them as data rows', () => {
    const csv = `${HEADER}\n\nspeaker-a,רמקול,physical,,,,\n\n\n`
    const result = parseProductsCsv(Buffer.from(csv))
    expect(result.totalDataRows).toBe(1)
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toEqual([])
  })

  it('ignores unknown columns and accepts a Uint8Array', () => {
    const csv = 'internal_note,slug,name_he,type\nignore me,cable-usb,כבל,physical\n'
    const result = parseProductsCsv(new TextEncoder().encode(csv))
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({ slug: 'cable-usb', name_he: 'כבל', type: 'physical' })
    expect(result.rows[0]).not.toHaveProperty('internal_note')
  })

  it('turns empty optional cells into nulls', () => {
    const result = parseProductsCsv(Buffer.from(`${HEADER}\nlamp-01,מנורה,physical,,,,\n`))
    expect(result.rows[0]?.name_en).toBeNull()
    expect(result.rows[0]?.kenyon_price).toBeNull()
    expect(result.rows[0]?.full_price).toBeNull()
    expect(result.rows[0]?.platform_percent).toBeNull()
  })

  it('rejects platform_percent above 100', () => {
    const result = parseProductsCsv(Buffer.from(`${HEADER}\nfee-check,מוצר,physical,,,,101\n`))
    expect(result.errors).toEqual([
      { row: 2, column: 'platform_percent', message: 'עמלה לא יכולה לעלות על 100' },
    ])
  })
})

// ── XLSX ─────────────────────────────────────────────────────────────────────

describe('parseProductsCsv – Excel input', () => {
  const headerRow: Cell[] = ['slug', 'name_he', 'type', 'kenyon_price', 'platform_percent']

  it('parses an uncompressed workbook using shared strings and numeric cells', () => {
    const buffer = xlsxBuffer([headerRow, ['tablet-11', 'טאבלט 11', 'physical', 1299.5, 8]])
    const result = parseProductsCsv(buffer)
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual([
      {
        slug: 'tablet-11',
        name_he: 'טאבלט 11',
        type: 'physical',
        name_en: null,
        description_he: null,
        kenyon_price: 1299.5,
        full_price: null,
        platform_percent: 8,
      },
    ])
  })

  it('parses a deflate-compressed workbook with inline strings', () => {
    const buffer = xlsxBuffer([headerRow, ['watch-42', 'שעון חכם', 'recurring', 39.9, 10]], {
      deflate: true,
      inlineStrings: true,
    })
    const result = parseProductsCsv(buffer)
    expect(result.errors).toEqual([])
    expect(result.rows[0]).toMatchObject({ slug: 'watch-42', type: 'recurring' })
  })

  it('keeps physical row numbers when Excel omits blank rows', () => {
    // Sheet rows 2 and 3 are absent from the XML; the bad row sits at row 4.
    const buffer = xlsxBuffer([headerRow, null, null, ['??', 'מוצר בעייתי', 'physical', 10, 5]])
    const result = parseProductsCsv(buffer)
    expect(result.totalDataRows).toBe(1)
    expect(result.errors).toEqual([
      { row: 4, column: 'slug', message: 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד' },
    ])
  })

  it('validates workbook rows exactly like CSV rows', () => {
    const buffer = xlsxBuffer([
      headerRow,
      ['ok-product', 'מוצר תקין', 'coupon', 50, 12],
      ['also-ok', 'מ', 'physical', 20, 5],
    ])
    const result = parseProductsCsv(buffer)
    expect(result.rows.map((row) => row.slug)).toEqual(['ok-product'])
    expect(result.errors).toEqual([
      { row: 3, column: 'name_he', message: 'שם חייב להכיל לפחות 2 תווים' },
    ])
  })

  it('rejects the legacy binary .xls format with a clear message', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    const result = parseProductsCsv(ole)
    expect(result.rows).toEqual([])
    expect(result.errors[0]?.row).toBe(0)
    expect(result.errors[0]?.message).toContain('xls')
  })

  it('reports a corrupt zip as a file-level error instead of throwing', () => {
    const corrupt = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(64, 7)])
    const result = parseProductsCsv(corrupt)
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([
      { row: 0, column: null, message: 'קובץ ה-Excel פגום או בפורמט שאינו נתמך' },
    ])
  })
})
