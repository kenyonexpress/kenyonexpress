import Link from 'next/link'
import { logout } from '@/app/actions/auth'

type Props = { fullName: string | null }

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map(n => n[0])
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
            className="w-9 h-9 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center hover:bg-brand-dark transition-colors"
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
