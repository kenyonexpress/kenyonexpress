import { AsyncLocalStorage } from 'node:async_hooks'
import { type RequestContext, setRequestStore } from './request-context'

/**
 * The one AsyncLocalStorage, and the only module in the tree that names
 * `node:async_hooks`.
 *
 * IMPORTING THIS IS A DECLARATION THAT THE IMPORTER IS SERVER-ONLY. Turbopack
 * builds a client chunk item for anything a client component can reach,
 * `'use server'` modules included, and a Node built-in in that graph is a hard
 * build error -- see the trace quoted in request-context.ts. That failure mode
 * is the useful one: it is loud, it happens at build time, and it names the
 * import path. Read and bind through request-context.ts instead, from anywhere.
 *
 * Installing is the whole export surface, and it happens on load, so importing
 * the module is using it. Two importers, deliberately:
 *   - `instrumentation.ts`, which Next runs once before the first request and
 *     which therefore covers Server Functions, whose modules cannot import this.
 *   - `with-request-log.ts`, so a route handler carries an id whether or not
 *     instrumentation ran -- a test importing the route directly does not.
 */
setRequestStore(new AsyncLocalStorage<RequestContext>())
