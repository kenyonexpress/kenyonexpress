import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildZip, crc32, readZip } from './zip'

/**
 * The risk this file carries is an archive that is self-consistent and that
 * nothing else can open, so the assertions are split: the round trip proves the
 * structure, a KNOWN CRC value proves the checksum is the IEEE one every unzip
 * expects (a wrong-but-consistent table would pass a round trip), and the
 * system `unzip` is asked for a verdict where it exists.
 */

describe('crc32', () => {
  it('matches the published IEEE check value', () => {
    // The canonical CRC-32 test vector: "123456789" -> 0xCBF43926.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('is zero for empty input', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0)
  })
})

describe('buildZip', () => {
  const entries = [
    { name: 'pass.json', data: Buffer.from('{"formatVersion":1}', 'utf8') },
    { name: 'icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]) },
    { name: 'signature', data: Buffer.from('not really a signature') },
  ]

  it('round-trips names, bytes and order', () => {
    const read = readZip(buildZip(entries))
    expect(read.map((e) => e.name)).toEqual(['pass.json', 'icon.png', 'signature'])
    expect(read[1]?.data.equals(entries[1]?.data as Buffer)).toBe(true)
  })

  it('is byte-identical across two builds of the same input', () => {
    // The reason the timestamps are frozen. Wallet replaces a pass by serial
    // number, and a re-download that differs only in mtime is a second copy of
    // the same coupon in the customer's list.
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true)
  })

  it('handles an empty archive', () => {
    const archive = buildZip([])
    expect(archive).toHaveLength(22)
    expect(readZip(archive)).toEqual([])
  })

  it('handles a zero-byte member', () => {
    const read = readZip(buildZip([{ name: 'empty', data: Buffer.alloc(0) }]))
    expect(read).toHaveLength(1)
    expect(read[0]?.data).toHaveLength(0)
  })

  it('points the central directory at the real local header offsets', () => {
    // The one field a round trip through `readZip` would NOT catch, because
    // readZip walks the local headers. Every real unzip uses the central
    // directory, so a wrong offset here is an archive that opens in the test
    // and nowhere else.
    const archive = buildZip(entries)
    const centralStart = archive.readUInt32LE(archive.length - 6)
    let cursor = centralStart
    for (const entry of entries) {
      expect(archive.readUInt32LE(cursor)).toBe(0x02014b50)
      const offset = archive.readUInt32LE(cursor + 42)
      expect(archive.readUInt32LE(offset)).toBe(0x04034b50)
      const nameLength = archive.readUInt16LE(offset + 26)
      expect(archive.toString('ascii', offset + 30, offset + 30 + nameLength)).toBe(entry.name)
      cursor += 46 + archive.readUInt16LE(cursor + 28)
    }
  })

  it('is readable by the system unzip', () => {
    // The verdict that matters and the one this file cannot fake. Skipped
    // rather than failed where unzip is absent, so CI on a bare image does not
    // go red for a missing tool.
    let unzip: string
    try {
      unzip = execFileSync('which', ['unzip']).toString().trim()
    } catch {
      return
    }

    const dir = mkdtempSync(path.join(tmpdir(), 'kev-zip-'))
    try {
      const file = path.join(dir, 'test.zip')
      writeFileSync(file, buildZip(entries))
      // -t tests every member's CRC against the archive's own records.
      const output = execFileSync(unzip, ['-t', file]).toString()
      expect(output).toContain('No errors detected')
      for (const entry of entries) expect(output).toContain(entry.name)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('readZip', () => {
  it('refuses an archive whose bytes were edited after the fact', () => {
    const archive = buildZip([{ name: 'pass.json', data: Buffer.from('{"a":1}') }])
    const tampered = Buffer.from(archive)
    // The payload starts right after the 30-byte header and the 9-byte name.
    tampered[30 + 9] = 0x21
    expect(() => readZip(tampered)).toThrow(/CRC/)
  })
})
