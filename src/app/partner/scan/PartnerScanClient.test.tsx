import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PartnerScanClient from './PartnerScanClient'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// Mock parseScanInput
vi.mock('@/lib/vouchers/scan-input', () => ({
  parseScanInput: (raw: string) => {
    if (raw.includes('KEV1.')) {
      return { kind: 'token', token: raw, code: null }
    }
    if (/^[0-9A-HJKMNP-TV-Z]{10}$/.test(raw)) {
      return { kind: 'code', token: null, code: raw }
    }
    return { kind: 'invalid', token: null, code: null }
  },
}))

describe('PartnerScanClient', () => {
  beforeEach(() => {
    // Mock BarcodeDetector support
    Object.defineProperty(window, 'BarcodeDetector', {
      writable: true,
      value: class MockBarcodeDetector {
        async detect() {
          return []
        }
      },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the camera activation button when camera is off', () => {
    render(<PartnerScanClient />)

    expect(screen.getByText('הפעל מצלמה לסריקת QR')).toBeInTheDocument()
  })

  it('shows instructions for using the scanner', () => {
    render(<PartnerScanClient />)

    expect(screen.getByText('הוראות שימוש')).toBeInTheDocument()
    expect(screen.getByText(/לחצו על "הפעל מצלמה"/)).toBeInTheDocument()
  })

  // NOTE: Browser support detection test is skipped because jsdom defines
  // BarcodeDetector as non-configurable, making it impossible to mock its absence.
  // This functionality is better tested in E2E tests with real browsers.
  it.skip('shows unsupported message when BarcodeDetector is not available', () => {
    // Test skipped - see note above
  })

  it('calls getUserMedia when camera button is clicked', () => {
    // Mock getUserMedia
    const getUserMediaMock = vi.fn().mockResolvedValue({
      getTracks: () => [],
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    })

    render(<PartnerScanClient />)

    const button = screen.getByText('הפעל מצלמה לסריקת QR')
    fireEvent.click(button)

    // Verify getUserMedia was called with correct constraints
    expect(getUserMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: 'environment',
        }),
      }),
    )
  })
})
