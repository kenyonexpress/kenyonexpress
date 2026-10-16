'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { buildCouponShareText, waChatLink, waShareLink } from '@/lib/whatsapp'
import { formatVoucherCode } from '@/server/domain/vouchers/code'

interface SupplierInfo {
  name: string | null
  address?: string | null
  contact_phone?: string | null
  opening_hours?: string | null
}

interface OrderVoucherCardProps {
  id: string
  code: string
  qrDataUrl: string | null
  expiresAt: string
  collectAmountAgorot: number
  productName?: string | null
  supplierInfo?: SupplierInfo | null
  siteUrl: string
}

export function OrderVoucherCard({
  id,
  code,
  qrDataUrl,
  expiresAt,
  collectAmountAgorot,
  productName,
  supplierInfo,
  siteUrl,
}: OrderVoucherCardProps) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const shareHref = waShareLink(
    buildCouponShareText({
      productName: productName ?? null,
      code,
      collectAmountAgorot,
      expiresAt,
      siteUrl,
    }),
  )

  // Build Google Maps link
  const mapsHref = supplierInfo?.address
    ? `https://maps.google.com/?q=${encodeURIComponent(
        `${supplierInfo.name || 'עסק'}, ${supplierInfo.address}`,
      )}`
    : null

  // Build WhatsApp chat link for business
  const businessWAHref =
    supplierInfo?.contact_phone &&
    waChatLink(
      supplierInfo.contact_phone,
      `שלום, רכשתי קופון אצלכם בקוד ${formatVoucherCode(code)}`,
    )

  // Generate PDF button handler
  const handleDownloadPDF = async () => {
    try {
      const response = await fetch('/api/voucher/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherId: id,
          code,
          productName,
          expiresAt,
          collectAmountAgorot,
          qrDataUrl,
          supplierInfo,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate PDF')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coupon-${formatVoucherCode(code)}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('PDF download error:', error)
      // Show toast notification for error
    }
  }

  // Add to Apple Wallet handler
  const handleAddToAppleWallet = async () => {
    try {
      const response = await fetch('/api/voucher/pkpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherId: id,
          code,
          productName,
          expiresAt,
          collectAmount: collectAmountAgorot,
          barcode: code,
          supplierInfo,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate pass')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coupon-${formatVoucherCode(code)}.pkpass`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Apple Wallet error:', error)
    }
  }

  return (
    <article className="order-voucher-card" key={id}>
      <div className="order-voucher-card__content">
        {/* Product info */}
        {productName && <div className="order-voucher-card__product">{productName}</div>}

        {/* QR Code - centered and prominent */}
        {qrDataUrl && (
          <div className="order-voucher-card__qr-container">
            <img
              src={qrDataUrl}
              alt={`קוד QR לקופון ${code}`}
              className="order-voucher-card__qr"
              width={300}
              height={300}
            />
          </div>
        )}

        {/* 8-digit code in monospace */}
        <div className="order-voucher-card__code" dir="ltr">
          {formatVoucherCode(code)}
        </div>

        {/* Collection amount if needed */}
        {collectAmountAgorot > 0 && (
          <div className="order-voucher-card__collect">
            לתשלום בעסק במימוש: <strong>{shekels(agorot(collectAmountAgorot))}</strong>
          </div>
        )}

        {/* Supplier/Business info */}
        {supplierInfo?.name && (
          <section className="order-voucher-card__supplier">
            <h4 className="order-voucher-card__supplier-name">{supplierInfo.name}</h4>

            {/* Address with Google Maps link */}
            {supplierInfo.address && (
              <div className="order-voucher-card__supplier-address">
                {mapsHref ? (
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                    📍 {supplierInfo.address}
                  </a>
                ) : (
                  <>📍 {supplierInfo.address}</>
                )}
              </div>
            )}

            {/* Phone with tel: link */}
            {supplierInfo.contact_phone && (
              <div className="order-voucher-card__supplier-phone">
                <a href={`tel:${supplierInfo.contact_phone}`}>☎️ {supplierInfo.contact_phone}</a>
              </div>
            )}

            {/* Opening hours if available */}
            {supplierInfo.opening_hours && (
              <div className="order-voucher-card__supplier-hours">
                🕐 {supplierInfo.opening_hours}
              </div>
            )}
          </section>
        )}

        {/* Validity info */}
        <div className="order-voucher-card__validity">
          בתוקף עד {expiryDate} · הציגו את הקוד או את ה-QR בבית העסק
        </div>

        {/* Action buttons */}
        <div className="order-voucher-card__actions">
          {/* Download PDF button */}
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="order-voucher-card__button order-voucher-card__button--primary"
            title="הורד קופון כ-PDF לשמירה"
          >
            📄 הורד PDF
          </button>

          {/* Apple Wallet / Google Pay button */}
          <button
            type="button"
            onClick={handleAddToAppleWallet}
            className="order-voucher-card__button order-voucher-card__button--secondary"
            title="הוסף ל-Apple Wallet או Google Pay"
          >
            🎫 ארנק דיגיטלי
          </button>

          {/* WhatsApp share button */}
          {shareHref && (
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="order-voucher-card__button order-voucher-card__button--whatsapp"
            >
              <WhatsAppIcon size={16} /> שתף
            </a>
          )}
        </div>

        {/* Chat with business via WhatsApp */}
        {businessWAHref && (
          <div className="order-voucher-card__business-chat">
            <a href={businessWAHref} target="_blank" rel="noopener noreferrer">
              💬 דברו עם העסק בוואטסאפ
            </a>
          </div>
        )}
      </div>
    </article>
  )
}
