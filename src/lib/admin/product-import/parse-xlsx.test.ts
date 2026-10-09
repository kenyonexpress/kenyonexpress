import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { XlsxFormatError, parseXlsx } from './parse-xlsx'

/**
 * The fixtures are zips built by hand: stored (method 0) entries by default,
 * deflate (method 8) where the test says so, CRCs left at zero because the
 * parser reads sizes and data only. The XML mirrors what Excel writes,
 * including the parts the parser must ignore.
 */

function le16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function le32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

interface ZipFile {
  name: string
  content: string
  deflate?: boolean
}

function makeZip(files: ZipFile[]): ArrayBuffer {
  const encoder = new TextEncoder()
  const out: number[] = []
  const central: number[] = []

  for (const file of files) {
    const nameBytes = [...encoder.encode(file.name)]
    const raw = encoder.encode(file.content)
    const data = file.deflate ? [...deflateRawSync(raw)] : [...raw]
    const method = file.deflate ? 8 : 0
    const offset = out.length

    out.push(
      0x50,
      0x4b,
      0x03,
      0x04, // local header signature
      ...le16(20),
      ...le16(0),
      ...le16(method),
      ...le16(0),
      ...le16(0), // time, date
      ...le32(0), // crc (unchecked)
      ...le32(data.length),
      ...le32(raw.length),
      ...le16(nameBytes.length),
      ...le16(0),
      ...nameBytes,
      ...data,
    )

    central.push(
      0x50,
      0x4b,
      0x01,
      0x02, // central directory signature
      ...le16(20),
      ...le16(20),
      ...le16(0),
      ...le16(method),
      ...le16(0),
      ...le16(0), // time, date
      ...le32(0), // crc
      ...le32(data.length),
      ...le32(raw.length),
      ...le16(nameBytes.length),
      ...le16(0),
      ...le16(0), // name, extra, comment
      ...le16(0),
      ...le16(0),
      ...le32(0), // disk, internal attrs, external attrs
      ...le32(offset),
      ...nameBytes,
    )
  }

  const cdOffset = out.length
  out.push(...central)
  out.push(
    0x50,
    0x4b,
    0x05,
    0x06, // end of central directory
    ...le16(0),
    ...le16(0),
    ...le16(files.length),
    ...le16(files.length),
    ...le32(central.length),
    ...le32(cdOffset),
    ...le16(0),
  )
  return new Uint8Array(out).buffer
}

const WORKBOOK = `<?xml version="1.0"?><workbook><sheets>
  <sheet name="ראשי" sheetId="1" r:id="rId7"/>
  <sheet name="שני" sheetId="2" r:id="rId8"/>
</sheets></workbook>`

const RELS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId8" Type="t" Target="worksheets/other.xml"/>
  <Relationship Id="rId7" Type="t" Target="worksheets/main.xml"/>
</Relationships>`

const SHARED = `<?xml version="1.0"?><sst count="3" uniqueCount="3">
  <si><t>slug</t></si>
  <si><r><t>שם </t></r><r><t xml:space="preserve">מוצר</t></r></si>
  <si><t>מוצר &amp; עוד_x000A_שורה</t></si>
</sst>`

// Row 3 is blank (self-closing), row 4 skips column B, row 5 has a formula
// whose cached value must be read, plus a boolean and an out-of-order ref.
const SHEET = `<?xml version="1.0"?><worksheet><cols><col min="1" max="1"/></cols><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>מחיר</t></is></c></row>
  <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="str"><v>ok</v></c><c r="C2"><v>199.9</v></c></row>
  <row r="3"/>
  <row r="4"><c r="A4"><v>7290000000001</v></c><c r="C4"><v>12</v></c></row>
  <row r="5"><c r="A5"><f>1+4</f><v>5</v></c><c r="B5" t="b"><v>1</v></c></row>
</sheetData></worksheet>`

function fixture(overrides: Partial<Record<string, string>> = {}): ArrayBuffer {
  return makeZip([
    { name: 'xl/workbook.xml', content: overrides['xl/workbook.xml'] ?? WORKBOOK },
    { name: 'xl/_rels/workbook.xml.rels', content: overrides.rels ?? RELS },
    { name: 'xl/sharedStrings.xml', content: overrides.shared ?? SHARED },
    { name: 'xl/worksheets/main.xml', content: overrides.sheet ?? SHEET, deflate: true },
    {
      name: 'xl/worksheets/other.xml',
      content:
        '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>junk</t></is></c></row></sheetData></worksheet>',
    },
  ])
}

describe('parseXlsx', () => {
  it('reads the first sheet by workbook order, resolving shared and inline strings', async () => {
    const { rows, errors, truncated } = await parseXlsx(fixture())
    expect(errors).toEqual([])
    expect(truncated).toBe(false)
    expect(rows[0]).toEqual(['slug', 'שם מוצר', 'מחיר'])
    expect(rows[1]).toEqual(['מוצר & עוד\nשורה', 'ok', '199.9'])
  })

  it('keeps blank rows dense and leaves gaps for skipped cells', async () => {
    const { rows } = await parseXlsx(fixture())
    expect(rows[2]).toEqual([]) // Excel row 3, self-closing
    expect(rows[3]).toEqual(['7290000000001', '', '12']) // B4 missing
    expect(rows[4]).toEqual(['5', 'TRUE']) // cached formula value, boolean
    expect(rows).toHaveLength(5)
  })

  it('inflates deflated entries (the sheet fixture is method 8)', async () => {
    // Guarded by the fixture itself: main.xml is written with deflate: true,
    // so the first assertion above already went through DecompressionStream.
    // This test pins that the stored/deflated paths agree.
    const stored = await parseXlsx(
      makeZip([
        { name: 'xl/workbook.xml', content: WORKBOOK },
        { name: 'xl/_rels/workbook.xml.rels', content: RELS },
        { name: 'xl/sharedStrings.xml', content: SHARED },
        { name: 'xl/worksheets/main.xml', content: SHEET },
      ]),
    )
    const deflated = await parseXlsx(fixture())
    expect(stored.rows).toEqual(deflated.rows)
  })

  it('falls back to sheet1.xml when there are no usable rels', async () => {
    const zip = makeZip([
      {
        name: 'xl/workbook.xml',
        content: '<workbook><sheets><sheet name="a" sheetId="1"/></sheets></workbook>',
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        content:
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>',
      },
    ])
    const { rows } = await parseXlsx(zip)
    expect(rows).toEqual([['x']])
  })

  it('rejects a file that is not a zip, in Hebrew', async () => {
    const notZip = new TextEncoder().encode('slug,name\na,b\n').buffer as ArrayBuffer
    await expect(parseXlsx(notZip)).rejects.toBeInstanceOf(XlsxFormatError)
    await expect(parseXlsx(notZip)).rejects.toThrow(/xlsx/)
  })

  it('rejects a zip with no workbook', async () => {
    const zip = makeZip([{ name: 'hello.txt', content: 'shalom' }])
    await expect(parseXlsx(zip)).rejects.toBeInstanceOf(XlsxFormatError)
  })

  it('truncates past maxRows and says so', async () => {
    const { rows, errors, truncated } = await parseXlsx(fixture(), { maxRows: 2 })
    expect(truncated).toBe(true)
    expect(rows).toHaveLength(2)
    expect(errors.some((e) => e.message.includes('נחתך'))).toBe(true)
  })

  it('caps runaway cell lengths', async () => {
    const long = 'א'.repeat(50)
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${long}</t></is></c></row></sheetData></worksheet>`
    const { rows, errors } = await parseXlsx(fixture({ sheet }), { maxFieldLength: 10 })
    expect(rows[0]?.[0]).toHaveLength(10)
    expect(errors.some((e) => e.message.includes('נחתך'))).toBe(true)
  })
})
