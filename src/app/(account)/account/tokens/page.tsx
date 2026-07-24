import TokenManager from '@/components/account/TokenManager'
import { getMyPaymentTokens } from '@/server/queries/account'

export const metadata = { title: 'אמצעי תשלום' }

export default async function TokensPage() {
  const tokens = await getMyPaymentTokens()

  return (
    <>
      <h1 className="account-title">אמצעי תשלום</h1>
      <p className="account-subtitle">
        נשמרות רק 4 הספרות האחרונות והטוקן של Cardcom. מספר הכרטיס המלא לא נשמר אצלנו.
      </p>
      <TokenManager tokens={tokens} />
    </>
  )
}
