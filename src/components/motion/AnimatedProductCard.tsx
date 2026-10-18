'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { type Transition, motion } from 'framer-motion'

const cardVariants = {
  initial: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -8,
    transition: {
      duration: 0.2,
      ease: [0.34, 1.56, 0.64, 1],
    } as Transition,
  },
}

const shadowTransition: Transition = {
  duration: 0.2,
  ease: [0.34, 1.56, 0.64, 1],
}

interface AnimatedProductCardProps {
  product: Product
}

export default function AnimatedProductCard({ product }: AnimatedProductCardProps) {
  return (
    <motion.div variants={cardVariants} initial="initial" whileHover="hover" className="h-full">
      <motion.div
        initial={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}
        whileHover={{ boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)' }}
        transition={shadowTransition}
        className="h-full"
      >
        <ProductCard product={product} />
      </motion.div>
    </motion.div>
  )
}
