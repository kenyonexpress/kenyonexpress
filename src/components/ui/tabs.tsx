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
      data-[state=active]:text-brand data-[state=active]:shadow-sm ${className}`}
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
