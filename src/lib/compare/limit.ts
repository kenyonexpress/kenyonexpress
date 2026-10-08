/**
 * The compare list's two constants, in a plain module on purpose.
 *
 * `client-store.ts` is imported by client islands only, and a value exported
 * from a module that client code pulls in can arrive on the server as a
 * proxy rather than a number (a STEP 22 finding: `index < CONST` was silently
 * false in the built page while the component test passed). The page's
 * server-side copy and the server action read the limit from here.
 */

/** Four columns is what fits a 1440 table with a label column; five does not. */
export const COMPARE_LIMIT = 4

/** The `localStorage` key, fourth after the cart mirror, fallback and parked list. */
export const COMPARE_STORAGE_KEY = 'ke_compare_v1'
