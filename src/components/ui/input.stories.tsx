import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Input } from './input'

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      options: ['text', 'email', 'password', 'number', 'tel', 'url'],
      control: { type: 'select' },
    },
    placeholder: {
      control: { type: 'text' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Basic text input field
 */
export const Default: Story = {
  args: {
    placeholder: 'Enter your text here',
    type: 'text',
  },
}

/**
 * Email input with validation
 */
export const Email: Story = {
  args: {
    placeholder: 'Enter your email',
    type: 'email',
  },
}

/**
 * Password input field
 */
export const Password: Story = {
  args: {
    placeholder: 'Enter your password',
    type: 'password',
  },
}

/**
 * Disabled input field
 */
export const Disabled: Story = {
  args: {
    placeholder: 'This input is disabled',
    disabled: true,
    type: 'text',
  },
}

/**
 * Number input for quantities and amounts
 */
export const NumericInput: Story = {
  args: {
    placeholder: 'Enter a number',
    type: 'number',
    min: 1,
    max: 100,
  },
}

/**
 * Search input field (Hebrew RTL)
 */
export const Search: Story = {
  args: {
    placeholder: 'חפש מוצרים...',
    type: 'text',
  },
}

/**
 * Form with multiple inputs (interactive example)
 */
export const FormExample: Story = {
  render: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [formData, setFormData] = useState({
      name: '',
      email: '',
      phone: '',
    })

    return (
      <form className="w-96 space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium mb-1">
            Full Name
          </label>
          <Input
            id="fullName"
            placeholder="John Doe"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <Input
            id="email"
            placeholder="john@example.com"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone
          </label>
          <Input
            id="phone"
            placeholder="050-123-4567"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-brand text-white py-2 rounded hover:bg-brand-600"
          onClick={(e) => {
            e.preventDefault()
            alert(JSON.stringify(formData, null, 2))
          }}
        >
          Submit
        </button>
      </form>
    )
  },
}

/**
 * Input with error state (using aria-invalid)
 */
export const WithError: Story = {
  render: () => (
    <div className="w-96">
      <label htmlFor="username" className="block text-sm font-medium mb-1">
        Username
      </label>
      <Input
        id="username"
        placeholder="Enter username"
        aria-invalid="true"
        className="border-red-500"
      />
      <p className="text-red-600 text-sm mt-1">Username must be at least 3 characters</p>
    </div>
  ),
}
