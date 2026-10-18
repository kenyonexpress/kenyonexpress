'use client'

import CouponCard, { type Coupon } from '@/components/CouponCard'
import { type Transition, motion } from 'framer-motion'

const couponCardVariants = {
  initial: { scale: 1, rotateZ: 0 },
  hover: {
    scale: 1.02,
    rotateZ: 0.5,
    transition: {
      duration: 0.2,
      ease: [0.34, 1.56, 0.64, 1],
    } as Transition,
  },
}

const couponShadowTransition: Transition = {
  duration: 0.2,
  ease: [0.34, 1.56, 0.64, 1],
}

export default function AnimatedCouponCard({ coupon }: { coupon: Coupon }) {
  return (
    <motion.div
      variants={couponCardVariants}
      initial="initial"
      whileHover="hover"
      className="h-full"
    >
      <motion.div
        initial={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}
        whileHover={{ boxShadow: '0 12px 24px rgba(0, 0, 0, 0.12)' }}
        transition={couponShadowTransition}
        className="h-full"
      >
        <CouponCard coupon={coupon} />
      </motion.div>
    </motion.div>
  )
}
