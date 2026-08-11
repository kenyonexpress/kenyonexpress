/**
 * A minimal store-only ZIP writer, which is all a `.pkpass` is.
 *
 * WHY NOT A LIBRARY
 *
 * A pkpass is a flat archive of at most a dozen small files: `pass.json`, a
 * manifest, a signature and a few PNGs. Deflate saves nothing measurable on
 * that and buys a dependency whose surface is a hundred times the ~90 lines
 * below. Method 0 (stored) is part of the original spec and every unzip
 * implementation, including iOS's, reads it.
 *
 * WHAT IS DELIBERATELY LEFT OUT, AND WHY IT IS SAFE HERE
 *
 *   - No Zip64. Entries are bounded by what a pass may contain; the writer
 *     throws rather than silently emitting a truncated size field.
 *   - No data descriptors. Sizes and CRC are known before the header is
 *     written, because everything is a Buffer already in memory.
 *   - No directory entries and no unicode flag games: every name here is ASCII
 *     and fixed by Apple (`pass.json`, `manifest.json`, `signature`, `icon.png`
 *     …), so there is no filename that needs UTF-8 to survive.
 *
 * Entry ORDER is preserved as given. It is not cosmetic: `manifest.json` must
 * describe the payload files and `signature` must sign the manifest, so the
 * caller builds them in that order and the archive keeps it.
 */

export interface ZipEntry {
  name: string
  data: Buffer
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50
const MAX_UINT32 = 0xffffffff

/** Table-driven CRC-32 (IEEE), built once. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

export function crc32(data: Buffer): number {
  let crc = -1
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ (data[i] as number)) & 0xff] as number)
  }
  return (crc ^ -1) >>> 0
}

/**
 * DOS date/time, which is what the ZIP format stores.
 *
 * Fixed at the epoch of the format (1980-01-01 00:00) rather than taken from
 * the clock, so the same pass built twice is the same bytes twice. That is what
 * makes the archive testable at all, and a pass carries its own dates in
 * `pass.json` — the archive's mtime is read by nothing.
 */
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1 // 1980-01-01

export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'ascii')
    const size = entry.data.length
    if (size > MAX_UINT32 || offset > MAX_UINT32) {
      throw new Error(`zip: ${entry.name} exceeds the 4GB limit this writer supports`)
    }
    const crc = crc32(entry.data)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(LOCAL_HEADER, 0)
    local.writeUInt16LE(10, 4) // version needed: 1.0, stored
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method: stored
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    name.copy(local, 30)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(CENTRAL_HEADER, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(10, 6) // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk number
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(0, 38) // external attributes
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)

    locals.push(local, entry.data)
    centrals.push(central)
    offset += local.length + size
  }

  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_CENTRAL, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, centralDirectory, end])
}

/**
 * Reads a stored archive back. Exists for the tests: an archive nothing can
 * open is the failure this whole file risks, and asserting on the bytes it
 * wrote would only prove it is self-consistent.
 */
export function readZip(archive: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []
  let cursor = 0
  while (cursor + 4 <= archive.length && archive.readUInt32LE(cursor) === LOCAL_HEADER) {
    const nameLength = archive.readUInt16LE(cursor + 26)
    const extraLength = archive.readUInt16LE(cursor + 28)
    const size = archive.readUInt32LE(cursor + 18)
    const crc = archive.readUInt32LE(cursor + 14)
    const start = cursor + 30 + nameLength + extraLength
    const data = archive.subarray(start, start + size)
    if (crc32(data) !== crc) throw new Error('zip: CRC mismatch')
    entries.push({ name: archive.toString('ascii', cursor + 30, cursor + 30 + nameLength), data })
    cursor = start + size
  }
  return entries
}
