import { EMAIL_PREVIEWS, PREVIEW_SITE_URL } from '@/lib/email/previews'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

/**
 * Every mail this system can send, rendered, on one page.
 *
 * WHY IT IS WORTH A ROUTE
 *
 * Seventeen builders write raw HTML with hand-placed RTL isolates, because that
 * is what mail clients accept. All seventeen are tested, and every one of those
 * tests asserts a SUBSTRING -- `toContain('שלום דנה')` proves the greeting is in
 * the string and proves nothing about whether the layout holds, whether a
 * Hebrew line wraps against a number, or whether a shekel sign lands on the
 * wrong side of an amount. Before this page, nobody had looked at most of them.
 *
 * DEV ONLY, AND ENFORCED WITH A 404 RATHER THAN A REDIRECT
 *
 * `notFound()` and not a guard, because a guard implies there is something
 * behind it. In production this route does not exist, and the honest answer to
 * a request for it is that there is nothing there.
 *
 * The check is on `NODE_ENV`, which is `production` for a local `pnpm start` --
 * so this page is unavailable in exactly the mode that mirrors production, on
 * purpose. It is a `pnpm dev` tool. Anything that has to be checked against a
 * production build gets checked in a mail client, which is where these are
 * actually read.
 *
 * NOTHING IS SENT FROM HERE. There is no "send test" button and there will not
 * be one: a page that can put a message in a customer's inbox is a page that
 * eventually does, from a laptop, with a sample payload.
 */

export const metadata: Metadata = {
  title: 'תצוגת מיילים',
  robots: { index: false, follow: false },
}

const AUDIENCE_LABEL = {
  customer: 'לקוח',
  supplier: 'ספק',
  operator: 'תפעול',
} as const

export default function EmailPreviewIndex() {
  if (process.env.NODE_ENV === 'production') notFound()

  const groups = (['customer', 'supplier', 'operator'] as const).map((audience) => ({
    audience,
    previews: EMAIL_PREVIEWS.filter((preview) => preview.audience === audience),
  }))

  return (
    <main dir="rtl" className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-black text-heading">תצוגת מיילים</h1>
      <p className="mt-2 text-sm text-muted">
        {EMAIL_PREVIEWS.length} מיילים. כל אחד נבנה מהבונה האמיתי ומטען לדוגמה, דרך אותה דלת שהמנקז
        משתמש בה. אין כאן שליחה.
      </p>

      {groups.map((group) => (
        <section key={group.audience} className="mt-6">
          <h2 className="text-lg font-bold text-heading">{AUDIENCE_LABEL[group.audience]}</h2>
          <ul className="mt-2 divide-y divide-black/10 rounded-xl border border-black/10">
            {group.previews.map((preview) => {
              // Built here so a builder that throws on its own sample fails the
              // INDEX rather than a page nobody opened. A broken sample is a
              // broken sample whichever page notices it.
              let subject: string
              try {
                subject = preview.build(PREVIEW_SITE_URL).subject
              } catch (error) {
                subject = `שגיאה: ${error instanceof Error ? error.message : 'unknown'}`
              }
              return (
                <li key={preview.id} className="flex items-baseline justify-between gap-3 p-3">
                  <Link href={`/dev/emails/${preview.id}`} className="font-semibold text-heading">
                    {preview.labelHe}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{subject}</span>
                  <code className="text-xs text-muted" dir="ltr">
                    {preview.id}
                  </code>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </main>
  )
}
