/** Section 7 row: "ביצועי QR עם קופונים רבים". Measures the real encoder. */
import QRCode from 'qrcode'
const url = 'https://kenyonexpress.co.il/redeem/KEV1.AAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB'
for (const width of [264]) {
  const dataUrl = await QRCode.toDataURL(url, { width, margin: 1 })
  const bytes = Buffer.byteLength(dataUrl, 'utf8')
  console.log(`width=${width} one QR data URL = ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`)
  for (const n of [1, 5, 10, 25]) {
    console.log(
      `  ${String(n).padStart(2)} coupons -> ${((bytes * n) / 1024).toFixed(0)} KB of HTML`,
    )
  }
}

// Encode time, which is the other half of the row: the page awaits one
// `toDataURL` per voucher inside a Promise.all, on the server, per request.
for (const n of [1, 10, 25]) {
  const t0 = process.hrtime.bigint()
  await Promise.all(
    Array.from({ length: n }, (_, i) => QRCode.toDataURL(`${url}${i}`, { width: 264, margin: 1 })),
  )
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  console.log(`encode ${String(n).padStart(2)} QRs: ${ms.toFixed(1)} ms`)
}
