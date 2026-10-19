import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A composable card component for organizing content. Includes CardHeader, CardTitle, CardDescription, CardContent, and CardFooter.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>כרטיס בסיסי</CardTitle>
      </CardHeader>
      <CardContent>
        <p>זה תוכן פשוט בתוך כרטיס.</p>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A basic card with header and content.',
      },
    },
  },
}

export const Complete: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>דוגמה מלאה</CardTitle>
        <CardDescription>זה תיאור קצר של הכרטיס</CardDescription>
      </CardHeader>
      <CardContent>
        <p>תוכן הכרטיס עם מידע פרטני על הפריט.</p>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="primary" size="sm">
          אישור
        </Button>
        <Button variant="ghost" size="sm">
          ביטול
        </Button>
      </CardFooter>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A complete card with header, description, content, and footer with actions.',
      },
    },
  },
}

export const WithImage: Story = {
  render: () => (
    <Card className="w-full max-w-sm overflow-hidden">
      <div className="bg-gradient-to-br from-blue-400 to-purple-500 h-40" />
      <CardHeader>
        <CardTitle>כרטיס עם תמונה</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600">כרטיס עם תמונה או כיסוי בחלקו העליון</p>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Card with an image or colored header section.',
      },
    },
  },
}

export const Grid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-lg">אפשרות {i}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">תוכן קצר</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multiple cards in a grid layout.',
      },
    },
  },
}

export const Minimal: Story = {
  render: () => (
    <Card className="w-full max-w-sm">
      <CardContent className="pt-6">
        <p>כרטיס מינימליסטי בלי כותרת</p>
      </CardContent>
    </Card>
  ),
  parameters: {
    docs: {
      description: {
        story: 'A minimal card with only content.',
      },
    },
  },
}
