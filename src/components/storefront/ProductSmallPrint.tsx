import { t } from '@/lib/i18n/messages'
import { type SmallPrintInput, buildSmallPrint } from '@/lib/product/small-print'
import Link from 'next/link'

/**
 * The small print under the details band, on every product type.
 *
 * Server markup with no client state, like `SupplierInfo`: the product page is
 * static and this block is derived entirely from what the page already loaded.
 * The lines themselves come from `buildSmallPrint`, which is pure and tested;
 * this component only decides how a line and its optional link are drawn.
 *
 * Small on purpose (meta size, muted ink). These are the terms a careful
 * shopper reads before paying, not a promotion, and they must not compete
 * with the price or the buy button for attention.
 */
export default function ProductSmallPrint(props: SmallPrintInput) {
  const lines = buildSmallPrint(props)
  if (lines.length === 0) return null

  return (
    <section
      className="pdp-small-print"
      aria-labelledby="pdp-small-print-title"
      data-pdp="small-print"
    >
      <h2 id="pdp-small-print-title" className="pdp-small-print__title">
        {t('pdp.smallPrint.title')}
      </h2>
      <ul className="pdp-small-print__list">
        {lines.map((line) => (
          <li key={line.id} data-small-print={line.id}>
            {line.text}
            {line.link &&
              (line.link.external ? (
                <>
                  {' '}
                  <a href={line.link.href} target="_blank" rel="noopener noreferrer nofollow">
                    {line.link.label}
                  </a>
                </>
              ) : (
                <>
                  {' '}
                  <Link href={line.link.href}>{line.link.label}</Link>
                </>
              ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
