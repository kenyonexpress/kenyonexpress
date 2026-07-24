import AddressManager from '@/components/account/AddressManager'
import { getMyAddresses } from '@/server/queries/account'

export const metadata = { title: 'כתובות' }

export default async function AddressesPage() {
  const addresses = await getMyAddresses()

  return (
    <>
      <h1 className="account-title">כתובות</h1>
      <p className="account-subtitle">כתובות למשלוח מוצרים פיזיים</p>
      <AddressManager addresses={addresses} />
    </>
  )
}
