/**
 * Magic-link template, behind the templates door.
 *
 * The builder lives in `../magic-link.ts`; the sender is
 * `server/auth/magic-link-send.ts`. See `./password-reset.ts` for why the
 * two auth mails sit beside each other and outside the outbox.
 */
export {
  buildMagicLinkEmail,
  type BuiltMagicLinkEmail,
  type MagicLinkEmailInput,
} from '@/lib/email/magic-link'
