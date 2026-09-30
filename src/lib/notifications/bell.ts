/**
 * The account bell's row shape and panel size, shared by the Server Action
 * that reads the first paint (server/actions/bell.ts) and the component that
 * keeps it live (components/account/NotificationBell.tsx). Here and not in
 * the action file because a `'use server'` module may export only async
 * functions.
 */

export type BellRow = {
  id: string
  kind: string
  title_he: string
  body_he: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export const BELL_PANEL_SIZE = 15
