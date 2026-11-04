/**
 * Marks the /auth/callback leg that came from the post-payment Google prompt
 * (S07). Its own module because a 'use server' file may export only async
 * functions.
 */
export const GUEST_LINK_PARAM = 'guest_link'

/** Supabase's error code when the Google account already belongs to a user. */
export const IDENTITY_ALREADY_EXISTS = 'identity_already_exists'
