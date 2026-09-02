import { expect, test } from '@playwright/test'

const PAGES: Array<{ path: string; mustInclude: string }> = [
  { path: '/terms-and-conditions', mustInclude: 'תנאי השימוש של Cardcom' },
  { path: '/privacy-policy', mustInclude: '/api/account/data-export' },
  { path: '/refund_returns', mustInclude: '14 יום' },
  { path: '/accessibility', mustInclude: '5568' },
]

test.describe('legal documents are published', () => {
  for (const page of PAGES) {
    test(`${page.path} is live and states the binding fact`, async ({ page: p }) => {
      await p.goto(page.path)
      await expect(p.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(p.locator('body')).toContainText(page.mustInclude)
    })
  }
})
