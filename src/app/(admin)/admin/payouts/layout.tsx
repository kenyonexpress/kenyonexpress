import Link from 'next/link'

export default function PayoutsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 border-b border-gray-200">
        <nav className="flex gap-4">
          <Link
            href="/admin/payouts"
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent hover:border-gray-300"
          >
            תשלומים לספקים
          </Link>
          <Link
            href="/admin/payouts/customer-withdrawals"
            className="px-4 py-2 text-sm font-medium border-b-2 border-transparent hover:border-gray-300"
          >
            משיכות לקוחות
          </Link>
        </nav>
      </div>
      {children}
    </div>
  )
}
