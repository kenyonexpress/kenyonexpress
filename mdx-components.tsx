import type { MDXComponents } from 'mdx/types'
import Link from 'next/link'

/**
 * How MDX renders inside this site.
 *
 * REQUIRED AT THE PROJECT ROOT. The App Router looks for `mdx-components.tsx`
 * here specifically; without it, MDX pages build and then render with no
 * styling at all, because Tailwind's preflight strips every default margin and
 * heading size. A post would come out as one wall of identical text - which
 * looks like a content bug rather than a missing file.
 *
 * Styles are stated per element rather than through a typography plugin. This
 * project has no `@tailwindcss/typography`, and the classes below are the same
 * scale `/about` and `/faq` already use, which is what keeps a blog post inside
 * the measured template instead of introducing a third rhythm.
 *
 * `a` is mapped to `next/link` for internal hrefs only. An external link routed
 * through the client router would be a full navigation Next cannot satisfy, and
 * `target="_blank"` without `rel="noreferrer"` leaks the referrer.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => <h1 className="mb-4 text-3xl font-bold text-heading" {...props} />,
    h2: (props) => <h2 className="mt-10 mb-3 text-xl font-semibold text-heading" {...props} />,
    h3: (props) => <h3 className="mt-6 mb-2 text-lg font-semibold text-heading" {...props} />,
    p: (props) => <p className="mt-3 text-base leading-relaxed text-heading/80" {...props} />,
    ul: (props) => (
      <ul
        className="mt-3 list-disc space-y-1.5 ps-6 text-base leading-relaxed text-heading/80"
        {...props}
      />
    ),
    ol: (props) => (
      <ol
        className="mt-3 list-decimal space-y-1.5 ps-6 text-base leading-relaxed text-heading/80"
        {...props}
      />
    ),
    li: (props) => <li {...props} />,
    strong: (props) => <strong className="font-semibold text-heading" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="mt-4 border-s-4 border-brand ps-4 text-base italic leading-relaxed text-heading/70"
        {...props}
      />
    ),
    hr: () => <hr className="my-8 border-heading/10" />,
    a: ({ href, children, ...rest }) => {
      const target = typeof href === 'string' ? href : ''
      const internal = target.startsWith('/') && !target.startsWith('//')
      return internal ? (
        <Link href={target} className="font-medium text-heading underline underline-offset-2">
          {children}
        </Link>
      ) : (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-heading underline underline-offset-2"
          {...rest}
        >
          {children}
        </a>
      )
    },
    ...components,
  }
}
