import type { Agorot } from '@/lib/money'
import type { MyTier } from '@/server/queries/club'
import type { CustomerVoucher } from '@/server/queries/vouchers'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AccountPageContent from './AccountPageContent'

vi.mock('@/components/account/ProfileDetailsForm', () => ({
  default: () => <div data-testid="profile-form">Profile Form</div>,
}))

vi.mock('@/components/auth/PasskeyManager', () => ({
  default: () => <div data-testid="passkey-manager">Passkey Manager</div>,
}))

vi.mock('@/components/account/AddressManager', () => ({
  default: () => <div data-testid="address-manager">Address Manager</div>,
}))

vi.mock('@/app/(account)/account/security/SecurityClient', () => ({
  default: () => <div data-testid="security-client">Security Client</div>,
}))

vi.mock('@/server/actions/auth', () => ({
  signOut: vi.fn(),
}))

const mockAgorot = (n: number): Agorot => n as unknown as Agorot

const mockProps = {
  wallet: { balanceAgorot: mockAgorot(50000) },
  orders: [
    {
      id: '1',
      totalAgorot: mockAgorot(100000),
      settlementStatus: 'completed',
      createdAt: '2024-01-01',
      itemCount: 2,
    },
  ],
  coupons: [
    {
      id: 'c1',
      code: 'TEST',
      qr_payload: 'qr',
      status: 'issued' as const,
      face_value_agorot: 50000,
      coupon_price_agorot: 30000,
      remaining_amount_due_agorot: 20000,
      offer_valid_until: '2024-12-31',
      expires_at: '2024-12-31',
      issued_at: '2024-01-01',
      redeemed_at: null,
      product: null,
      supplier: null,
    } as CustomerVoucher,
  ],
  tier: {
    tierKey: 'silver',
    tierNameHe: 'כסף',
    spendAgorot: mockAgorot(500000),
    nextTierNameHe: 'זהב',
    toNextAgorot: mockAgorot(1000000),
    benefits: ['5%'],
  } as MyTier,
  wishlistEntries: [
    {
      product_id: 'p1',
      created_at: '2024-01-01',
      product: { name_he: 'מוצר', price_ils: 100, images: ['/img.jpg'], slug: 'slug' },
    },
  ],
  profile: { fullName: 'שם', email: 'user@test.com', phone: '0501234567' },
  addresses: [{ id: 'a1' } as any],
  isStaff: false,
}

describe('AccountPageContent', () => {
  it('renders overview tab by default', () => {
    render(<AccountPageContent {...mockProps} />)
    expect(screen.getByText('סקירה מהירה של החשבון שלך')).toBeInTheDocument()
  })

  it('renders all five tabs', () => {
    render(<AccountPageContent {...mockProps} />)
    expect(screen.getByText('סקירה')).toBeInTheDocument()
    expect(screen.getAllByText('ההזמנות שלי').length).toBeGreaterThan(0)
    expect(screen.getByText('רשימת המשאלות')).toBeInTheDocument()
    expect(screen.getByText('כתובות')).toBeInTheDocument()
    expect(screen.getByText('הגדרות')).toBeInTheDocument()
  })

  it('switches to orders tab on click', () => {
    render(<AccountPageContent {...mockProps} />)
    const tabs = screen.getAllByText('ההזמנות שלי')
    fireEvent.click(tabs[0] as unknown as Element)
    expect(screen.getByText('1 הזמנות')).toBeInTheDocument()
  })

  it('switches to wishlist tab on click', () => {
    render(<AccountPageContent {...mockProps} />)
    fireEvent.click(screen.getByText('רשימת המשאלות') as unknown as Element)
    expect(screen.getByText('רשימת המשאלות שלי')).toBeInTheDocument()
  })

  it('switches to addresses tab on click', () => {
    render(<AccountPageContent {...mockProps} />)
    fireEvent.click(screen.getByText('כתובות') as unknown as Element)
    expect(screen.getByTestId('address-manager')).toBeInTheDocument()
  })

  it('switches to settings tab on click', () => {
    render(<AccountPageContent {...mockProps} />)
    fireEvent.click(screen.getByText('הגדרות') as unknown as Element)
    expect(screen.getByTestId('profile-form')).toBeInTheDocument()
  })

  it('displays wallet balance on overview', () => {
    render(<AccountPageContent {...mockProps} />)
    expect(screen.getByText('יתרת הארנק')).toBeInTheDocument()
  })
})
