'use server'

// Actions live at @/server/actions/auth — re-exported here for compatibility.
export {
  signInWithEmail as login,
  signUpWithEmail as signup,
  signOut as logout,
  type AuthState,
} from '@/server/actions/auth'
