/**
 * Tzimmer (vacation rental) booking calendar schema.
 * BACKLOG Item 7: Tzimmer calendar, Phase 2.
 *
 * Implements booking/availability calendar for tzimmer products.
 * Activated when tzimmer-calendar feature flag is enabled.
 */

import { z } from 'zod'

export const bookingStatusSchema = z.enum(['pending', 'confirmed', 'cancelled', 'completed'])

export type BookingStatus = z.infer<typeof bookingStatusSchema>

export const createBookingSchema = z.object({
  productId: z.string().uuid(),
  userId: z.string().uuid(),
  checkIn: z.date(),
  checkOut: z.date(),
  guests: z.number().int().positive().max(20),
  priceAgorot: z.number().int().positive(),
})

export type CreateBooking = z.infer<typeof createBookingSchema>

export const bookingSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  userId: z.string().uuid(),
  checkIn: z.date(),
  checkOut: z.date(),
  guests: z.number().int().positive(),
  status: bookingStatusSchema,
  priceAgorot: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cancelledAt: z.date().nullable(),
})

export type Booking = z.infer<typeof bookingSchema>

export const availabilitySchema = z.object({
  productId: z.string().uuid(),
  date: z.date(),
  isAvailable: z.boolean(),
  maxGuests: z.number().int().positive().nullable(),
  priceAgorot: z.number().int().positive().nullable(),
})

export type Availability = z.infer<typeof availabilitySchema>

/**
 * Calculate number of nights in a booking.
 */
export function calculateNights(checkIn: Date, checkOut: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((checkOut.getTime() - checkIn.getTime()) / msPerDay)
}

/**
 * Check if dates overlap with existing booking.
 */
export function hasDateOverlap(
  checkIn1: Date,
  checkOut1: Date,
  checkIn2: Date,
  checkOut2: Date,
): boolean {
  // Check-in on check-out day is allowed (no overlap)
  return checkIn1 < checkOut2 && checkOut1 > checkIn2
}

/**
 * Validate booking dates are in the future and checkout after checkin.
 */
export function validateBookingDates(
  checkIn: Date,
  checkOut: Date,
): { valid: boolean; error?: string } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (checkIn < now) {
    return { valid: false, error: 'Check-in date must be in the future' }
  }

  if (checkOut <= checkIn) {
    return { valid: false, error: 'Check-out must be after check-in' }
  }

  const nights = calculateNights(checkIn, checkOut)
  if (nights > 365) {
    return { valid: false, error: 'Booking cannot exceed 365 nights' }
  }

  return { valid: true }
}
