'use client'

import { type Transition, motion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const pageVariants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -10,
  },
}

const pageTransition: Transition = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1],
}

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <motion.div
      key={pathname}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={pageTransition}
      className="w-full"
    >
      {children}
    </motion.div>
  )
}
