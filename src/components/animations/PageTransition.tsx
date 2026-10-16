'use client'

import { pageVariants } from '@/lib/animations/variants'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PageTransitionProps {
  children: ReactNode
}

export default function PageTransition({ children }: PageTransitionProps) {
  return (
    <motion.div animate="animate" exit="exit" initial="initial" variants={pageVariants}>
      {children}
    </motion.div>
  )
}
