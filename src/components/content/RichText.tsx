import type { Block, Inline } from '@/lib/content/markup'
import { parseBlocks } from '@/lib/content/markup'
import Link from 'next/link'

/**
 * Operator-authored body copy, rendered as React children.
 *
 * There is no `dangerouslySetInnerHTML` here and there cannot be one: the input
 * is a tree of four block kinds and three inline kinds from
 * `lib/content/markup.ts`, and every leaf lands in a text position that React
 * escapes. That is the point of parsing rather than sanitising, and it is what
 * lets `scripts/raw-html-gate.mjs` stay strict while the admin panel gains a
 * body editor.
 *
 * THE TYPOGRAPHY IS `/about`'s, COPIED RATHER THAN INVENTED. `max-w-3xl` for
 * the measure, `text-base leading-relaxed text-heading/80` for body copy,
 * `text-xl font-semibold` for a section heading. `/about` was built to match
 * `/faq`, which was measured against the live template, so a new rhythm here
 * would be a third one - which is the thing `content-pages.test.ts` and the
 * comparison gate both exist to refuse.
 *
 * An internal link is `next/link` and an external one is `<a>` with
 * `rel="noreferrer"`. `isRenderableHref` has already refused anything that is
 * not a path, `https:`, `mailto:` or `tel:`, so the only judgement left here is
 * which element navigates best.
 */

function InlineSpans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((span, index) => {
        const key = `${span.kind}-${index}-${span.text}`
        if (span.kind === 'strong') {
          return (
            <strong key={key} className="font-semibold text-heading">
              {span.text}
            </strong>
          )
        }
        if (span.kind === 'link') {
          const className = 'font-medium text-heading underline underline-offset-2'
          return span.href.startsWith('/') ? (
            <Link key={key} href={span.href} className={className}>
              {span.text}
            </Link>
          ) : (
            <a key={key} href={span.href} className={className} rel="noreferrer">
              {span.text}
            </a>
          )
        }
        return <span key={key}>{span.text}</span>
      })}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === 'heading') {
    // Level two and three only. The page's `<h1>` is its title column, so a
    // body cannot open a second one and break the document outline.
    return block.level === 2 ? (
      <h2 className="mt-8 text-xl font-semibold text-heading first:mt-0">
        <InlineSpans spans={block.spans} />
      </h2>
    ) : (
      <h3 className="mt-6 text-base font-semibold text-heading first:mt-0">
        <InlineSpans spans={block.spans} />
      </h3>
    )
  }

  if (block.kind === 'list') {
    const items = block.items.map((spans, index) => (
      // The rendered words are the only stable identity a list item has; two
      // identical lines are indistinguishable, so the index joins the key.
      <li key={`${index}-${spans.map((span) => span.text).join('')}`}>
        <InlineSpans spans={spans} />
      </li>
    ))
    return block.ordered ? (
      <ol className="mt-3 list-decimal space-y-2 ps-6 text-base leading-relaxed text-heading/80">
        {items}
      </ol>
    ) : (
      <ul className="mt-3 list-disc space-y-2 ps-6 text-base leading-relaxed text-heading/80">
        {items}
      </ul>
    )
  }

  if (block.kind === 'quote') {
    return (
      <blockquote className="mt-4 border-s-4 border-brand ps-4 text-base leading-relaxed text-heading/80">
        <InlineSpans spans={block.spans} />
      </blockquote>
    )
  }

  return (
    <p className="mt-3 text-base leading-relaxed text-heading/80">
      <InlineSpans spans={block.spans} />
    </p>
  )
}

export default function RichText({ markup, className }: { markup: string; className?: string }) {
  const blocks = parseBlocks(markup)
  if (blocks.length === 0) return null

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <BlockView key={`${block.kind}-${index}`} block={block} />
      ))}
    </div>
  )
}
