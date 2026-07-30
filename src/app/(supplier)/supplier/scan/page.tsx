import { redirect } from 'next/navigation'

/**
 * The scan screen moved to /scan, which is short enough to type on a phone at a
 * till. This redirect is what keeps every printed card, bookmark and older QR
 * that names /supplier/scan working.
 */
export default function LegacySupplierScanPage() {
  redirect('/scan')
}
