'use client'

import { backdropVariants, modalVariants } from '@/lib/animations/variants'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface ModalAnimatedProps {
  children: ReactNode
  isOpen: boolean
  onClose?: () => void
  className?: string
}

export default function ModalAnimated({
  children,
  isOpen,
  onClose,
  className,
}: ModalAnimatedProps) {
  if (!isOpen) {
    return null
  }

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center z-50"
      variants={backdropVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={onClose}
    >
      <motion.div
        className={className}
        variants={modalVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
