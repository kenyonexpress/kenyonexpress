import type { Meta, StoryObj } from '@storybook/react'
import PriceDisplay from './PriceDisplay'

const meta = {
  title: 'Components/PriceDisplay',
  component: PriceDisplay,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Display prices in ILS currency with optional sale pricing, savings badge, and Hebrew numeral support.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    price: {
      control: { type: 'number' },
      description: 'Current/sale price in ILS (shekels)',
    },
    originalPrice: {
      control: { type: 'number' },
      description: 'Original/full price in ILS, if on sale',
    },
    showSavingsBadge: {
      control: { type: 'boolean' },
      description: 'Show savings badge with amount and percentage',
    },
    allowHebrewNumerals: {
      control: { type: 'boolean' },
      description: 'Allow toggling between Arabic and Hebrew numerals',
    },
  },
} satisfies Meta<typeof PriceDisplay>

export default meta
type Story = StoryObj<typeof meta>

export const RegularPrice: Story = {
  args: {
    price: 9999,
    showSavingsBadge: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Display a regular price without any discount.',
      },
    },
  },
}

export const SalePrice: Story = {
  args: {
    price: 4999,
    originalPrice: 9999,
    showSavingsBadge: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Display a discounted price with the original price struck through and savings badge.',
      },
    },
  },
}

export const LargeDiscount: Story = {
  args: {
    price: 2999,
    originalPrice: 9999,
    showSavingsBadge: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Show a significant discount with prominent savings display.',
      },
    },
  },
}

export const WithHebrewNumerals: Story = {
  args: {
    price: 5999,
    originalPrice: 9999,
    allowHebrewNumerals: true,
    showSavingsBadge: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Enable Hebrew numeral toggle button for accessibility.',
      },
    },
  },
}

export const WithoutSavingsBadge: Story = {
  args: {
    price: 4999,
    originalPrice: 9999,
    showSavingsBadge: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Sale price without the savings badge display.',
      },
    },
  },
}

export const CustomStyling: Story = {
  args: {
    price: 7999,
    originalPrice: 11999,
    className: 'max-w-sm',
    priceClassName: 'text-2xl font-bold text-brand-red',
  },
  parameters: {
    docs: {
      description: {
        story: 'Apply custom CSS classes for styling variations.',
      },
    },
  },
}
