import type { Preview } from '@storybook/react'
import { ThemeProvider } from 'next-themes'
import '../src/styles/globals.css'
import '../src/styles/tokens.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    docs: {
      toc: true,
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="light">
        <div dir="rtl" className="bg-background text-foreground">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
}

export default preview
