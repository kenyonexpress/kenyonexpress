import { render, screen } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import MobileNavBar from './MobileNavBar'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

describe('MobileNavBar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('renders all navigation items', () => {
    render(<MobileNavBar />)
    expect(screen.getByText('בית')).toBeInTheDocument()
    expect(screen.getByText('קטגוריות')).toBeInTheDocument()
    expect(screen.getByText('חיפוש')).toBeInTheDocument()
    expect(screen.getByText('רשימת משאלות')).toBeInTheDocument()
    expect(screen.getByText('חשבון')).toBeInTheDocument()
  })

  it('marks home link as active when pathname is /', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<MobileNavBar />)
    const homeLink = screen.getByRole('link', { name: /בית/ })
    expect(homeLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks categories link as active when pathname starts with /products', () => {
    vi.mocked(usePathname).mockReturnValue('/products/electronics')
    render(<MobileNavBar />)
    const categoriesLink = screen.getByRole('link', { name: /קטגוריות/ })
    expect(categoriesLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks search link as active when pathname starts with /search', () => {
    vi.mocked(usePathname).mockReturnValue('/search?q=test')
    render(<MobileNavBar />)
    const searchLink = screen.getByRole('link', { name: /חיפוש/ })
    expect(searchLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks wishlist link as active when pathname starts with /wishlist', () => {
    vi.mocked(usePathname).mockReturnValue('/wishlist')
    render(<MobileNavBar />)
    const wishlistLink = screen.getByRole('link', { name: /רשימת משאלות/ })
    expect(wishlistLink).toHaveAttribute('aria-current', 'page')
  })

  it('marks account link as active when pathname starts with /account', () => {
    vi.mocked(usePathname).mockReturnValue('/account/orders')
    render(<MobileNavBar />)
    const accountLink = screen.getByRole('link', { name: /חשבון/ })
    expect(accountLink).toHaveAttribute('aria-current', 'page')
  })

  it('has data-mobile-nav attribute', () => {
    const { container } = render(<MobileNavBar />)
    expect(container.querySelector('[data-mobile-nav]')).toBeInTheDocument()
  })

  it('has aria-label for navigation', () => {
    render(<MobileNavBar />)
    expect(screen.getByLabelText('ניווט נייד')).toBeInTheDocument()
  })
})
