import type { ReactNode } from 'react'

/**
 * The frame every blog page sits in, index and post alike.
 *
 * It exists so an `.mdx` post needs no wrapper of its own. An MDX file exports
 * only its content; without a layout it would render straight into the store
 * layout with no measure, no padding and no max width, and the fix would have
 * to be repeated in every future post.
 *
 * `max-w-3xl` is the same measure `/about` and `/faq` use, which is what keeps
 * a post inside the rhythm the template was measured against rather than
 * introducing a third one.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <div className="max-w-3xl">{children}</div>
    </main>
  )
}
