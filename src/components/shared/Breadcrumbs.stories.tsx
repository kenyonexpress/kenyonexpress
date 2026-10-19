import type { Meta, StoryObj } from '@storybook/react'
import Breadcrumbs from './Breadcrumbs'

const meta = {
  title: 'Shared/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Navigation breadcrumbs component showing the current page location. Supports mobile truncation with ellipsis.',
      },
    },
  },
  argTypes: {
    items: {
      description: 'Array of breadcrumb items with label and href',
      control: 'object',
    },
    showEllipsis: {
      control: 'boolean',
      description: 'Show ellipsis on mobile for truncation',
    },
  },
} satisfies Meta<typeof Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

export const SimplePath: Story = {
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'מוצר', href: '/product/example' },
    ],
  },
}

export const FullPath: Story = {
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'קטגוריות', href: '/categories' },
      { label: 'אלקטרוניקה', href: '/categories/electronics' },
      { label: 'טלפונים', href: '/categories/electronics/phones' },
    ],
  },
}

export const ProductPath: Story = {
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'אופנה', href: '/categories/fashion' },
      { label: 'חולצות גברים', href: '/categories/fashion/mens-shirts' },
    ],
  },
}

export const MobileView: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'קטגוריות', href: '/categories' },
      { label: 'אלקטרוניקה', href: '/categories/electronics' },
      { label: 'טלפונים', href: '/categories/electronics/phones' },
      { label: 'iPhone 15', href: '/product/iphone15' },
    ],
    showEllipsis: true,
  },
}

export const WithCustomClassName: Story = {
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'משהו', href: '/somewhere' },
    ],
    className: 'text-sm',
  },
}

export const LongProductName: Story = {
  args: {
    items: [
      { label: 'בית', href: '/' },
      { label: 'טכנולוגיה', href: '/categories/tech' },
      { label: 'מחשבים ניידים', href: '/categories/tech/laptops' },
      {
        label: 'מחשב נייד גיימינג עם מעבד Intel Core i9 והגרפיקה NVIDIA RTX 4090',
        href: '/product/gaming-laptop',
      },
    ],
  },
}
