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
  const innerContent = (
    <motion.div variants={cardShadowVariants} initial="initial" whileHover="hover" whileTap="tap">
      {children}
    </motion.div>
  )

  if (onClick) {
    return (
      // biome-ignore lint/a11y/useSemanticElements lint/a11y/noRedundantRoles: test queries [role="button"]
      <button className={className} onClick={onClick} type="button" role="button">
        <motion.div
          initial="initial"
          whileHover="hover"
          whileTap="tap"
          variants={cardHoverVariants}
        >
          {innerContent}
        </motion.div>
      </button>
    )
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements lint/a11y/noRedundantRoles: test queries [role="button"]
    <button className={className} type="button" disabled role="button">
      <motion.div initial="initial" whileHover="hover" whileTap="tap" variants={cardHoverVariants}>
        {innerContent}
      </motion.div>
    </button>
  )
}
