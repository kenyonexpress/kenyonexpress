import { PRESS_EMPTY_COPY, type PressMention } from '@/content/about'

/**
 * Press mentions (STEP 53).
 *
 * With entries: one row per article, the outlet and the article's own
 * headline, linking to the source, with the article's date. Without entries:
 * a sentence that says so and the press contact. The empty state is the
 * honest one and is what ships today; a row of invented logos is the thing
 * `content/about` exists to prevent.
 */
export default function AboutPress({
  mentions,
  email,
}: {
  mentions: readonly PressMention[]
  email: string
}) {
  const mailto = `mailto:${email}?subject=${encodeURIComponent(PRESS_EMPTY_COPY.subject)}`

  return (
    <section aria-labelledby="about-press">
      <h2 id="about-press" className="text-xl font-semibold text-heading">
        {PRESS_EMPTY_COPY.heading}
      </h2>

      {mentions.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {mentions.map((mention) => (
            <li key={mention.url} data-testid="press-mention">
              <a
                href={mention.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-medium text-heading underline underline-offset-4"
              >
                {mention.title}
              </a>
              <p className="text-sm text-heading/75">
                {mention.outlet}
                <span aria-hidden="true" className="mx-2">
                  ·
                </span>
                <time dateTime={mention.publishedAt}>
                  {new Date(mention.publishedAt).toLocaleDateString('he-IL', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid="press-empty" className="mt-3 text-base leading-relaxed text-heading/80">
          {PRESS_EMPTY_COPY.body}
        </p>
      )}

      <p className="mt-3 text-base leading-relaxed text-heading/80">
        {PRESS_EMPTY_COPY.invite}{' '}
        <a
          href={mailto}
          dir="ltr"
          data-testid="press-contact"
          className="font-medium text-heading underline underline-offset-4"
        >
          {email}
        </a>
      </p>
    </section>
  )
}
