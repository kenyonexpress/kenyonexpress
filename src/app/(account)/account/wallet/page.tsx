import WalletView from '@/components/account/WalletView'

export const metadata = { title: 'הארנק שלי' }

/**
 * The account-nav door to the wallet. The page itself is `WalletView`, shared
 * with `/wallet` (STEP 13) so both doors show one read.
 */
export default function WalletPage() {
  return <WalletView />
}
