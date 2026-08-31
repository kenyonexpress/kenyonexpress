/**
 * `import 'server-only'` is a build-time poison pill: the real package resolves
 * only under the `react-server` condition, so Vite cannot load it and any
 * module carrying the marker was unreachable from a unit test. That is a guard
 * against shipping a module to the browser, not against testing it, and the
 * modules behind it (search, storage, mail) are exactly the ones worth testing.
 *
 * The marker's real enforcement is `next build`, which still runs.
 */
export {}
