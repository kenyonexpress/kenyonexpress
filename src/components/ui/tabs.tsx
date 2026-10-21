'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'

interface TabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  children: React.ReactNode
}

const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps>(
  ({ ...props }, ref) => <TabsPrimitive.Root ref={ref} {...props} />,
)
Tabs.displayName = TabsPrimitive.Root.displayName

interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className = '', ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={`inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-600 ${className}`}
      {...props}
    />
  ),
)
TabsList.displayName = TabsPrimitive.List.displayName

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {}

/**
 * The active trigger is dark text on white, NOT `text-brand`. Brand yellow is
 * #fed700 and measures 1.4:1 against the white active surface where AA wants
 * 4.5:1; axe reported it as a serious color-contrast violation on /login (the
 * email tab) in every E2E run that scanned the form after it was revealed,
 * measured 2026-10-21. tokens.css already records that yellow is not a text
 * colour here, and the forgotten-password and sign-up links were moved off it
 * for the same reason. `text-brand-dark` (#1a1a1a) is 17.4:1 on white. The
 * white surface and the shadow still mark the selected tab.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3
      py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none
      focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2
      disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white
      data-[state=active]:text-brand-dark data-[state=active]:shadow-sm ${className}`}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

interface TabsContentProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {}

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  TabsContentProps
>(({ className = '', ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={`mt-4 ring-offset-white focus-visible:outline-none focus-visible:ring-2
      focus-visible:ring-brand focus-visible:ring-offset-2 ${className}`}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
