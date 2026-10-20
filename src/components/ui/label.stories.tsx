import type { Meta, StoryObj } from '@storybook/react'
import { Label } from './label'

const meta = {
  title: 'UI/Label',
  component: Label,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Form label component with variants, sizes, and required field indicator.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'error', 'success', 'muted'],
      description: 'Label style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Label size',
    },
    required: {
      control: 'boolean',
      description: 'Show red asterisk for required fields',
    },
  },
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: 'שם משתמש',
    variant: 'default',
    size: 'md',
    required: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Standard form label.',
      },
    },
  },
}

export const Required: Story = {
  args: {
    children: 'דוא"ל',
    variant: 'default',
    size: 'md',
    required: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Required field label with red asterisk.',
      },
    },
  },
}

export const ErrorState: Story = {
  args: {
    children: 'סיסמה חלשה',
    variant: 'error',
    size: 'md',
    required: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state label in red.',
      },
    },
  },
}

export const Success: Story = {
  args: {
    children: 'שם משתמש זמין',
    variant: 'success',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Success state label in green.',
      },
    },
  },
}

export const Muted: Story = {
  args: {
    children: 'רמז: השתמש בתווים מיוחדים',
    variant: 'muted',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Muted label for secondary text.',
      },
    },
  },
}

export const Small: Story = {
  args: {
    children: 'קטן',
    variant: 'default',
    size: 'sm',
  },
  parameters: {
    docs: {
      description: {
        story: 'Small label size.',
      },
    },
  },
}

export const Large: Story = {
  args: {
    children: 'גדול',
    variant: 'default',
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story: 'Large label size.',
      },
    },
  },
}
