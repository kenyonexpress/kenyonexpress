import type { Meta, StoryObj } from '@storybook/react'
import { Textarea } from './textarea'

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Multi-line text input component for longer text content.',
      },
    },
  },
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text shown in empty textarea',
    },
    disabled: {
      control: 'boolean',
      description: 'Disabled state',
    },
    rows: {
      control: { type: 'number', min: 2, max: 20 },
      description: 'Number of rows to display',
    },
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: 'כתוב הודעה...',
    rows: 4,
  },
  render: (args) => <Textarea {...args} />,
}

export const HebrewPlaceholder: Story = {
  args: {
    placeholder: 'כתוב את הערותיך או ביקורתך כאן...',
    rows: 5,
  },
  render: (args) => <Textarea {...args} />,
}

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2">
      <label htmlFor="message" className="block text-sm font-medium text-gray-700">
        הודעה
      </label>
      <Textarea id="message" placeholder="כתוב הודעה..." rows={4} />
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    placeholder: 'שדה זה מנוטרל',
    disabled: true,
    rows: 4,
  },
  render: (args) => <Textarea {...args} />,
}

export const WithError: Story = {
  render: () => (
    <div className="space-y-2">
      <label htmlFor="error-textarea" className="block text-sm font-medium text-gray-700">
        הערות (שדה חובה)
      </label>
      <Textarea
        id="error-textarea"
        placeholder="כתוב משהו..."
        rows={4}
        className="border-error-600"
      />
      <p className="text-sm text-error-600">זה שדה חובה.</p>
    </div>
  ),
}

export const FormExample: Story = {
  render: () => (
    <form className="max-w-md space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          שם
        </label>
        <input
          type="text"
          id="name"
          placeholder="שמך המלא"
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-600"
        />
      </div>
      <div>
        <label htmlFor="feedback" className="block text-sm font-medium text-gray-700">
          משוב
        </label>
        <Textarea id="feedback" placeholder="אנחנו אוהבים לשמוע את הדעה שלך..." rows={5} />
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        שלח משוב
      </button>
    </form>
  ),
}

export const LargeTextarea: Story = {
  args: {
    placeholder: 'כתוב טקסט גדול יותר...',
    rows: 10,
  },
  render: (args) => <Textarea {...args} />,
}
