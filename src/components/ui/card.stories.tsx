import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Basic card component displaying structured content with header, body, and footer.
 * Used throughout the design system for content grouping and separation.
 */
export const Basic: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here. This area holds the main content of the card.</p>
      </CardContent>
      <CardFooter>
        <button type="button" className="text-sm text-brand hover:text-brand-600">
          Learn more
        </button>
      </CardFooter>
    </Card>
  ),
}

/**
 * Product card showing typical e-commerce usage
 */
export const ProductCardStory: Story = {
  render: () => (
    <Card className="w-80 overflow-hidden">
      <div className="bg-gray-100 h-48 flex items-center justify-center">
        <span className="text-gray-400">Product Image</span>
      </div>
      <CardHeader>
        <CardTitle className="text-lg">Wireless Headphones</CardTitle>
        <CardDescription>High-quality audio device</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Price</span>
            <span className="text-2xl font-bold text-brand">₪299</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Rating</span>
            <span className="text-sm">★★★★★ (148)</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <button
          type="button"
          className="w-full bg-brand text-white py-2 rounded hover:bg-brand-600"
        >
          Add to Cart
        </button>
      </CardFooter>
    </Card>
  ),
}

/**
 * Card with minimal styling
 */
export const Minimal: Story = {
  render: () => (
    <Card className="w-80 border-0 shadow-sm">
      <CardContent className="pt-6">
        <p className="text-sm text-gray-700">
          This is a minimal card with reduced visual emphasis, useful for subtle UI elements.
        </p>
      </CardContent>
    </Card>
  ),
}

/**
 * Card with multiple sections
 */
export const WithSections: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-b pb-4">
          <h4 className="font-semibold mb-2">Items</h4>
          <ul className="text-sm space-y-1 text-gray-700">
            <li>• Product 1: ₪100</li>
            <li>• Product 2: ₪150</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Pricing</h4>
          <div className="text-sm space-y-1 text-gray-700">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>₪250</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping:</span>
              <span>₪30</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t">
              <span>Total:</span>
              <span className="text-brand">₪280</span>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <button
          type="button"
          className="w-full bg-brand text-white py-2 rounded hover:bg-brand-600"
        >
          Proceed to Checkout
        </button>
      </CardFooter>
    </Card>
  ),
}
