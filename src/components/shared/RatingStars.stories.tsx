import type { Meta, StoryObj } from '@storybook/react'
import { RatingStars } from './RatingStars'

const meta = {
  title: 'Shared/RatingStars',
  component: RatingStars,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Star rating display component with support for half-stars and Hebrew count labels. Accessible with aria-labels.',
      },
    },
  },
  argTypes: {
    rating: {
      control: { type: 'number', min: 0, max: 5, step: 0.5 },
      description: 'Rating value (0-5 with 0.5 increments)',
    },
    count: {
      control: 'number',
      description: 'Number of ratings',
    },
    showCount: {
      control: 'boolean',
      description: 'Show count text',
    },
    size: {
      control: 'text',
      description: 'Star size (CSS class suffix)',
    },
  },
} satisfies Meta<typeof RatingStars>

export default meta
type Story = StoryObj<typeof meta>

export const FiveStars: Story = {
  args: {
    rating: 5,
    count: 423,
    showCount: true,
  },
}

export const FourAndHalf: Story = {
  args: {
    rating: 4.5,
    count: 128,
    showCount: true,
  },
}

export const ThreeStars: Story = {
  args: {
    rating: 3,
    count: 45,
    showCount: true,
  },
}

export const HalfStar: Story = {
  args: {
    rating: 0.5,
    count: 2,
    showCount: true,
  },
}

export const WithoutCount: Story = {
  args: {
    rating: 4,
    count: 256,
    showCount: false,
  },
}

export const SingleRating: Story = {
  args: {
    rating: 3.5,
    count: 1,
    showCount: true,
  },
}

export const ZeroRatings: Story = {
  args: {
    rating: 0,
    count: 0,
    showCount: true,
  },
}

export const WithCustomAriaLabel: Story = {
  args: {
    rating: 4.5,
    count: 89,
    showCount: true,
    ariaLabel: 'דירוג מוצר: 4.5 כוכבים מתוך 89 דירוגים',
  },
}

export const LargeSize: Story = {
  args: {
    rating: 4,
    count: 150,
    showCount: true,
    size: 24,
  },
}

export const SmallSize: Story = {
  args: {
    rating: 3.5,
    count: 30,
    showCount: true,
    size: 16,
  },
}

export const ProductReview: Story = {
  args: {
    rating: 4.5,
    count: 234,
    showCount: true,
  },
  render: () => (
    <div className="max-w-sm p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-2">מוצר מומלץ</h3>
      <RatingStars rating={4.5} count={234} showCount={true} />
      <p className="text-sm text-gray-600 mt-3">מוצר איכותי במחיר טוב, משלוח מהיר.</p>
    </div>
  ),
}

export const RatingRange: Story = {
  args: {
    rating: 3,
    count: 32,
    showCount: true,
  },
  render: () => (
    <div className="space-y-4 max-w-sm">
      <div>
        <h3 className="text-sm font-medium mb-1">דירוג נמוך</h3>
        <RatingStars rating={2} count={15} showCount={true} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">דירוג בינוני</h3>
        <RatingStars rating={3} count={32} showCount={true} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">דירוג גבוה</h3>
        <RatingStars rating={4.5} count={128} showCount={true} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">דירוג מושלם</h3>
        <RatingStars rating={5} count={456} showCount={true} />
      </div>
    </div>
  ),
}
