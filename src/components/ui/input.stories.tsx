import type { Meta, StoryObj } from '@storybook/react'
import { Input } from './input'

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Text input component with multiple variants and sizes for form fields.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'error', 'success', 'disabled'],
      description: 'Input style variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Input size',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the input',
    },
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel'],
      description: 'Input type',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'הזן טקסט...',
    variant: 'default',
    size: 'md',
    type: 'text',
  },
  parameters: {
    docs: {
      description: {
        story: 'Standard text input field.',
      },
    },
  },
}

export const Email: Story = {
  args: {
    placeholder: 'דוא"ל שלך',
    type: 'email',
    variant: 'default',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Email input field with type validation.',
      },
    },
  },
}

export const Password: Story = {
  args: {
    placeholder: 'סיסמה',
    type: 'password',
    variant: 'default',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Password input field with masked text.',
      },
    },
  },
}

export const PhoneNumber: Story = {
  args: {
    placeholder: '+972 ...',
    type: 'tel',
    variant: 'default',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Phone number input field.',
      },
    },
  },
}

export const NumberInput: Story = {
  args: {
    placeholder: '0',
    type: 'number',
    variant: 'default',
    size: 'md',
  },
  parameters: {
    docs: {
      description: {
        story: 'Number input field with numeric controls.',
      },
    },
  },
}

export const Success: Story = {
  args: {
    placeholder: 'שם משתמש זמין',
    variant: 'success',
    size: 'md',
    defaultValue: 'user123',
  },
  parameters: {
    docs: {
      description: {
        story: 'Success state with green border.',
      },
    },
  },
}

export const ErrorState: Story = {
  args: {
    placeholder: 'דוא"ל לא תקין',
    variant: 'error',
    size: 'md',
    defaultValue: 'invalid-email',
  },
  parameters: {
    docs: {
      description: {
        story: 'Error state with red border.',
      },
    },
  },
}

export const Disabled: Story = {
  args: {
    placeholder: 'לא זמין',
    disabled: true,
    variant: 'disabled',
    size: 'md',
    defaultValue: 'מנוטרל',
  },
  parameters: {
    docs: {
      description: {
        story: 'Disabled input field.',
      },
    },
  },
}

export const Small: Story = {
  args: {
    placeholder: 'קטן',
    variant: 'default',
    size: 'sm',
  },
  parameters: {
    docs: {
      description: {
        story: 'Small input size for compact layouts.',
      },
    },
  },
}

export const Large: Story = {
  args: {
    placeholder: 'גדול',
    variant: 'default',
    size: 'lg',
  },
  parameters: {
    docs: {
      description: {
        story: 'Large input size for prominent fields.',
      },
    },
  },
}
