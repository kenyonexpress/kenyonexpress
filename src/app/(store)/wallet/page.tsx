import WalletView from '@/components/account/WalletView'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import '@/styles/account.css'

export const metadata: Metadata = {
  title: 'הארנק שלי',
  robots: { index: false, follow: false },
}

/**
 * `/wallet`: the cashback wallet at the short address STEP 13 names, inside
 * the storefront chrome. The account side nav has its own door at
 * `/account/wallet`; both render `WalletView`, so there is one read and one
 * screen behind two paths.
 *
 * SESSION. `src/proxy.ts` bounces `/wallet` to /login without a session, the
 * same rule as `/account*`. Every read inside `WalletView` goes through the
 * request-scoped client and RLS on `auth.uid()`, so the shell that
 * prerenders here holds nothing of anyone's.
 *
 * The shell prerenders; the reads live inside `<Suspense>`, same as
 * `gift-card/page.tsx`: uncached data outside a boundary fails the build.
 * `account.css` gives the balance card and the ledger table the look they
 * have in the account area.
 */
export default function StoreWalletPage() {
  return (
    <div className="account-page">
      <div className="account-page__inner">
        <nav className="account-page__crumb" aria-label="פירורי לחם">
          <Link href="/">עמוד הבית</Link>
          <span aria-hidden="true"> ‹ </span>
          <Link href="/account">האזור האישי</Link>
          <span aria-hidden="true"> ‹ </span>
          <span>הארנק שלי</span>
        </nav>
        <div className="account-content">
          <Suspense fallback={<p className="account-subtitle">רגע, טוענים את הארנק…</p>}>
            <WalletView />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
