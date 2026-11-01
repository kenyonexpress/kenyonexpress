/**
 * Client-safe piece of the deletion flow: the typed confirmation word the form
 * renders and the server action verifies. Lives apart from deletion.ts so the
 * client bundle never imports a module that touches the admin client.
 */
export const DELETE_CONFIRM_WORD = 'מחיקה'
