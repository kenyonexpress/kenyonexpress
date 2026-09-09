import { EMAIL_PREVIEWS, PREVIEW_SITE_URL, findPreview } from '@/lib/email/previews'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

/**
 * One mail, as HTML and as plain text.
 *
 * BOTH HALVES, SIDE BY SIDE, AND THAT IS THE POINT. Every builder produces a
 * `text` alternative as well as `html`, and the text half is the one nobody
 * reads: it is what a screen reader announces on some clients, what a plain
 * text client shows, and what lands in a spam-filter's excerpt. A gallery that
 * only rendered the HTML would leave exactly the half that already goes
 * unchecked unchecked.
 *
 * THE HTML IS IN AN IFRAME, NOT INJECTED. Mail HTML carries its own `<div dir>`,
 * its own inline styles and its own colours, and dropping it into this page
 * would let it inherit the site's CSS -- so the preview would show something the
 * customer will never see. `srcDoc` gives it its own document, which is what a
 * mail client gives it.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Prerendered per preview so the route needs no runtime params handling. */
export function generateStaticParams() {
  return EMAIL_PREVIEWS.map((preview) => ({ id: preview.id }))
}

export default async function EmailPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const { id } = await params
  const preview = findPreview(id)
  if (!preview) notFound()

  let built: { subject: string; html: string; text: string }
  try {
    built = preview.build(PREVIEW_SITE_URL)
  } catch (error) {
    // Shown rather than thrown. A builder that fails on its own sample is
    // exactly the thing this page exists to surface, and a 500 says less than
    // the message does.
    return (
      <main dir="rtl" className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-bold text-heading">{preview.labelHe}</h1>
        <pre className="mt-4 overflow-auto rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error instanceof Error ? error.stack : String(error)}
        </pre>
      </main>
    )
  }

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-6">
      <p className="text-sm">
        <Link href="/dev/emails">← כל המיילים</Link>
      </p>
      <h1 className="mt-2 text-xl font-bold text-heading">{preview.labelHe}</h1>
      <p className="mt-1 text-sm text-muted">
        נושא: <span className="font-semibold">{built.subject}</span>
      </p>

      <h2 className="mt-6 text-sm font-bold text-heading">HTML</h2>
      <iframe
        title={`${preview.labelHe} — HTML`}
        srcDoc={built.html}
        // An explicit height, in a style attribute rather than an arbitrary
        // Tailwind value: the token gate refuses raw px in a class, and a mail
        // preview's height is not a design token -- it is "tall enough to see a
        // mail in", which no palette should have an opinion about.
        style={{ height: 640 }}
        className="mt-2 w-full rounded-xl border border-black/15 bg-white"
      />

      <h2 className="mt-6 text-sm font-bold text-heading">טקסט</h2>
      <pre
        dir="rtl"
        className="mt-2 whitespace-pre-wrap rounded-xl border border-black/15 bg-white p-4 text-sm"
      >
        {built.text}
      </pre>
    </main>
  )
}
