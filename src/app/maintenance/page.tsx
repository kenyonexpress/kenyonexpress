export const metadata = {
  title: 'בעוד רגע חוזרים',
  robots: { index: false, follow: false },
}

/**
 * Where page visits go while maintenance mode is on (the proxy redirects
 * here). Plain and dependency-free on purpose: it has to render while the
 * rest of the site is the thing being worked on.
 */
export default function MaintenancePage() {
  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-bold text-heading">האתר בעבודת תחזוקה קצרה</h1>
      <p>אנחנו משדרגים את האתר וחוזרים בעוד כמה דקות. תודה על הסבלנות.</p>
    </main>
  )
}
