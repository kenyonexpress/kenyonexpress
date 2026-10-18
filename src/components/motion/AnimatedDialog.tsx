'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { type Transition, type Variants, motion } from 'framer-motion'
import type { ReactNode } from 'react'

const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const contentVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.34, 1.56, 0.64, 1],
    } as Transition,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2,
      ease: [0.43, 0.13, 0.23, 0.96],
    } as Transition,
  },
}

interface AnimatedDialogOverlayProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> {
  children?: ReactNode
}

export const AnimatedDialogOverlay = motion.create(
  ({ children, ...props }: AnimatedDialogOverlayProps) => (
    <DialogPrimitive.Overlay {...props}>{children}</DialogPrimitive.Overlay>
  ),
  { forwardMotionProps: true },
)

interface AnimatedDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  children?: ReactNode
}

export const AnimatedDialogContent = motion.create(
  ({ children, ...props }: AnimatedDialogContentProps) => (
    <DialogPrimitive.Content {...props}>{children}</DialogPrimitive.Content>
  ),
  { forwardMotionProps: true },
)

export { overlayVariants, contentVariants }
