import LandingCountdown from '@/components/landing/LandingCountdown'
import LandingProducts from '@/components/landing/LandingProducts'
import type { LandingBlock } from '@/lib/landing/blocks'
import { type CampaignParams, withCampaignParams } from '@/lib/landing/campaign-links'
import Image from 'next/image'
import Link from 'next/link'

/**
 * The landing page body: one switch over block kinds.
 *
 * Spacing and type sizes are the about page's (`max-w-3xl` measure,
 * `text-xl` section headings, `text-base leading-relaxed` body), so a new
 * campaign page inherits the rhythm the comparison gate already accepted
 * instead of defending one of its own. The product grid is the home page's
 * deal grid, card and all.
 *
 * EVERY LINK CARRIES THE CAMPAIGN (lib/landing/campaign-links.ts): the hero
 * CTA, the closing CTA and nothing else, because those are the clicks the
 * page exists for and the product cards already identify the product.
 */
export default function LandingBlocks({
  blocks,
  campaign,
}: {
  blocks: readonly LandingBlock[]
  campaign: CampaignParams
}) {
  return (
    <div className="space-y-10">
      {blocks.map((block, index) => (
        <LandingBlockView key={`${block.kind}-${index}`} block={block} campaign={campaign} />
      ))}
    </div>
  )
}

const CTA_CLASS =
  'inline-block rounded-lg bg-brand px-6 py-3 text-base font-semibold text-heading hover:opacity-90'

function LandingBlockView({ block, campaign }: { block: LandingBlock; campaign: CampaignParams }) {
  switch (block.kind) {
    case 'hero':
      return (
        <section
          data-block="hero"
          className="grid items-center gap-6 rounded-2xl border border-heading/10 bg-brand-accent/40 p-6 sm:p-10 md:grid-cols-[3fr_2fr]"
        >
          <div>
            <h1 className="text-3xl font-bold leading-tight text-heading sm:text-4xl">
              {block.headline}
            </h1>
            {block.subheadline && (
              <p className="mt-3 text-lg leading-relaxed text-heading/80">{block.subheadline}</p>
            )}
            {block.cta && (
              <Link
                href={withCampaignParams(block.cta.href, campaign)}
                className={`${CTA_CLASS} mt-6`}
              >
                {block.cta.label}
              </Link>
            )}
          </div>
          {block.imageUrl && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
              <Image
                src={block.imageUrl}
                alt={block.imageAlt ?? ''}
                fill
                sizes="(max-width: 768px) 100vw, 40vw"
                className="object-cover"
                priority
              />
            </div>
          )}
        </section>
      )

    case 'text':
      return (
        <section data-block="text" className="max-w-3xl">
          {block.title && <h2 className="text-xl font-semibold text-heading">{block.title}</h2>}
          {block.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 text-base leading-relaxed text-heading/80">
              {paragraph}
            </p>
          ))}
        </section>
      )

    case 'benefits':
      return (
        <section data-block="benefits">
          {block.title && (
            <h2 className="mb-4 text-xl font-semibold text-heading">{block.title}</h2>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {block.items.map((item) => (
              <li key={item.title} className="rounded-xl border border-heading/10 bg-white p-5">
                <h3 className="text-base font-semibold text-heading">{item.title}</h3>
                {item.text && (
                  <p className="mt-2 text-sm leading-relaxed text-heading/80">{item.text}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )

    case 'products':
      return <LandingProducts title={block.title} slugs={block.slugs} limit={block.limit} />

    case 'faq':
      return (
        <section data-block="faq" className="max-w-3xl">
          {block.title && (
            <h2 className="mb-2 text-xl font-semibold text-heading">{block.title}</h2>
          )}
          <dl className="divide-y divide-heading/10">
            {block.items.map((item) => (
              <div key={item.question} className="py-4">
                <dt className="text-base font-semibold text-heading">{item.question}</dt>
                <dd className="mt-2 text-base leading-relaxed text-heading/80">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )

    case 'countdown':
      return (
        <section
          data-block="countdown"
          className="rounded-xl border border-heading/10 bg-white px-5 py-4"
        >
          <LandingCountdown label={block.label} endsAt={block.endsAt} />
        </section>
      )

    case 'cta':
      return (
        <section data-block="cta" className="text-center">
          <Link href={withCampaignParams(block.href, campaign)} className={CTA_CLASS}>
            {block.label}
          </Link>
          {block.note && <p className="mt-3 text-sm text-heading/75">{block.note}</p>}
        </section>
      )

    default:
      return null
  }
}
