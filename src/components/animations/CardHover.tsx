'use client'

import { cardHoverVariants, cardShadowVariants } from '@/lib/animations/variants'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface CardHoverProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export default function CardHover({ children, className, onClick }: CardHoverProps) {
  if (onClick) {
    return (
      <motion.button
        className={className}
        initial="initial"
        whileHover="hover"
        whileTap="tap"
        variants={cardHoverVariants}
        onClick={onClick}
        type="button"
      >
        <motion.div
          variants={cardShadowVariants}
          initial="initial"
          whileHover="hover"
          whileTap="tap"
        >
          {children}
        </motion.div>
      </motion.button>
    )
  }

  return (
    <motion.div
      className={className}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
      variants={cardHoverVariants}
    >
      <motion.div variants={cardShadowVariants} initial="initial" whileHover="hover" whileTap="tap">
        {children}
      </motion.div>
    </motion.div>
  )
}
