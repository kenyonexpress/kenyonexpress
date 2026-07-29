import { logout } from '@/app/actions/auth'
import Link from 'next/link'

type Props = { fullName: string | null }

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
}

export default function Header({ fullName }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="flex items-center justify-between max-w-2xl mx-auto px-4 h-14">
        <form action={logout}>
          <button
            type="submit"
            title="יציאה"
            // text-heading, not text-white: white on brand yellow measures 1.41:1
            // against a 4.5:1 requirement, which is illegible rather than
            // merely non-compliant. The heading token on the same yellow is
            // 7.76:1. src/lib/a11y/contrast.test.ts pins both numbers.
            className="w-9 h-9 rounded-full bg-brand text-heading text-sm font-bold flex items-center justify-center hover:bg-brand-dark hover:text-white transition-colors"
          >
            {initials(fullName)}
          </button>
        </form>

        <Link href="/" className="text-xl font-bold text-brand tracking-tight">
          KenyonExpress
        </Link>
      </div>
    </header>
  )
}
