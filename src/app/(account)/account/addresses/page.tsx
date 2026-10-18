import AddressListSkeleton from '@/components/account/AddressListSkeleton'
import AddressManager from '@/components/account/AddressManager'
import { getMyAddresses } from '@/server/queries/account'
import { Suspense } from 'react'

export const metadata = { title: 'כתובות' }

async function AddressesContent() {
  const addresses = await getMyAddresses()

  return <AddressManager addresses={addresses} />
}

export default function AddressesPage() {
  return (
    <>
      <h1 className="account-title">כתובות</h1>
      <p className="account-subtitle">כתובות למשלוח מוצרים פיזיים</p>
      <Suspense fallback={<AddressListSkeleton count={3} />}>
        <AddressesContent />
      </Suspense>
    </>
  )
}
