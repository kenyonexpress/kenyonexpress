'use client'

import { useEffect, useState } from 'react'
import WithdrawModal from './WithdrawModal'

export default function WithdrawButton({
  balanceAgorot,
  userId,
}: {
  balanceAgorot: number
  userId: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [savedCards, setSavedCards] = useState<
    Array<{ id: string; last4: string; card_brand: string }>
  >([])

  useEffect(() => {
    // Fetch saved payment methods when component mounts
    async function fetchSavedCards() {
      try {
        const response = await fetch('/api/payment-methods')
        if (response.ok) {
          const data = await response.json()
          setSavedCards(data.methods || [])
        }
      } catch (error) {
        console.error('Failed to fetch saved payment methods:', error)
      }
    }
    fetchSavedCards()
  }, [])

  const canWithdraw = balanceAgorot >= 5000 // min 50 ILS

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        disabled={!canWithdraw}
        className="rounded-md bg-brand-dark px-4 py-2 text-sm font-medium text-white hover:bg-brand-darker disabled:opacity-50 disabled:cursor-not-allowed"
        title={!canWithdraw ? 'מינימום משיכה: 50 ₪' : undefined}
      >
        משיכת יתרה
      </button>

      {isModalOpen && (
        <WithdrawModal
          balanceAgorot={balanceAgorot}
          userId={userId}
          savedPaymentMethods={savedCards}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  )
}
