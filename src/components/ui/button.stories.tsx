import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A versatile button component with multiple variants, sizes, and states. Supports loading, disabled, and custom styling.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger', 'link'],
      description: 'Button style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon'],
      description: 'Button size',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the button',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading state',
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    children: 'צריך עזרה?',
    variant: 'primary',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Primary button with default Electro yellow background.',
      },
    },
  },
}

export const Secondary: Story = {
  args: {
    children: 'משמיכה שנייה',
    variant: 'secondary',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Secondary button with neutral gray background.',
      },
    },
  },
}

export const Ghost: Story = {
  args: {
    children: 'בטל',
    variant: 'ghost',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Ghost button with transparent background and text-only appearance.',
      },
    },
  },
}

export const Danger: Story = {
  args: {
    children: 'מחק',
    variant: 'danger',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Danger button for destructive actions.',
      },
    },
  },
}

export const Link: Story = {
  args: {
    children: 'קרא עוד',
    variant: 'link',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Link-style button with underline text appearance.',
      },
    },
  },
}

export const Small: Story = {
  args: {
    children: 'קטן',
    variant: 'primary',
    size: 'sm',
  },
  parameters: {
    docs: {
      description: {
        story: 'Small button size for compact layouts.',
      },
    },
  },
}

export const Large: Story = {
  args: {
    children: 'גדול',
    variant: 'primary',
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story: 'Large button size for prominent CTAs.',
      },
    },
  },
}

export const Loading: Story = {
  args: {
    children: 'שולח',
    variant: 'primary',
    size: 'md',
    loading: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Button in loading state with spinner.',
      },
    },
  },
}

export const LoadingWithText: Story = {
  args: {
    children: 'בדיקה',
    variant: 'primary',
    size: 'md',
    loading: true,
    loadingText: 'בדיקה...',
  },
  parameters: {
    docs: {
      description: {
        story: 'Button in loading state with custom loading text.',
      },
    },
  },
}

export const Disabled: Story = {
  args: {
    children: 'מנוטרל',
    variant: 'primary',
    size: 'md',
    disabled: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Disabled button that cannot be interacted with.',
      },
    },
  },
}

export const IconButton: Story = {
  args: {
    variant: 'primary',
    size: 'icon',
    children: '✓',
  },
  parameters: {
    docs: {
      description: {
        story: 'Square icon button for compact icon-only actions.',
      },
    },
  },
}
